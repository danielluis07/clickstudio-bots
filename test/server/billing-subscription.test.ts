import { afterEach, beforeEach, expect, test } from "bun:test";
import type { Database } from "@/db/database";
import { member, organization, user } from "@/db/schema";
import { createBilling, type Billing } from "@/modules/billing";
import { resolveTenantScope, type TenantScope } from "@/modules/tenancy";
import {
  createCancelSubscriptionAction,
  createChangeCardAction,
  createSubscribeAction,
} from "@/server/billing-subscription";
import { createTestClock } from "@/test/support/clock";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";
import { createTestDiagnostics } from "@/test/support/diagnostics";
import {
  createTestSubscriptionGateway,
  type TestSubscriptionGateway,
} from "@/test/support/subscription-gateway";

const day = 24 * 60 * 60 * 1000;
let db: Database;
let clock: ReturnType<typeof createTestClock>;
let gateway: TestSubscriptionGateway;
let billing: Billing;

const seedMember = async (role: "owner" | "member"): Promise<TenantScope> => {
  await db.insert(user).values({ id: role, name: role, email: `${role}@sorriso.example` });
  await db.insert(member).values({ organizationId: "tenant", userId: role, role });
  return (await resolveTenantScope(db, { userId: role }))!;
};

const actionAs = (scope: TenantScope, diagnostics = createTestDiagnostics()) =>
  createSubscribeAction({ billing, requireTenantScope: async () => scope, diagnostics });

const card = { cardToken: "card-token", payerEmail: "pagamentos@sorriso.example" };

const changeCardAs = (scope: TenantScope, diagnostics = createTestDiagnostics()) =>
  createChangeCardAction({ billing, requireTenantScope: async () => scope, diagnostics });

const newCard = { cardToken: "new-card-token", lastFourDigits: "5682" };

beforeEach(async () => {
  db = await createTestDatabase();
  clock = createTestClock(new Date("2026-12-01T12:00:00Z"));
  gateway = createTestSubscriptionGateway(clock);
  billing = createBilling({
    db,
    clock,
    enabled: true,
    subscriptions: { gateway, appUrl: "https://bots.example.com" },
  });
  await db.insert(organization).values({ id: "tenant", name: "Clínica Sorriso", slug: "tenant" });
  await billing.launch();
});

afterEach(() => closeTestDatabase(db));

test("the action authenticates before reading its input", async () => {
  const action = createSubscribeAction({
    billing,
    requireTenantScope: async () => {
      throw new Error("Unauthorized");
    },
  });
  await expect(action(card)).rejects.toThrow("Unauthorized");
});

test("an owner on Trial is told when the first charge happens", async () => {
  const owner = await seedMember("owner");
  expect(await actionAs(owner)(card)).toEqual({
    status: "success",
    message: "Assinatura feita. A primeira cobrança será em 31/12/2026, quando o teste termina.",
  });
});

test("a Suspended owner is told the Bot returns once the charge is approved", async () => {
  const owner = await seedMember("owner");
  clock.advance(31 * day);
  await billing.sweep();
  expect(await actionAs(owner)(card)).toEqual({
    status: "success",
    message:
      "Assinatura feita. O Bot volta a responder assim que o Mercado Pago aprovar a cobrança.",
  });
});

test("refusals and bad input come back in pt-BR", async () => {
  const owner = await seedMember("owner");
  expect(await actionAs(owner)({ ...card, payerEmail: "not-an-email" })).toEqual({
    status: "error",
    message: "Informe um e-mail válido para o pagador.",
  });
  expect(await actionAs(owner)({ payerEmail: card.payerEmail })).toEqual({
    status: "error",
    message: "Preencha os dados do cartão.",
  });
  expect(await actionAs(await seedMember("member"))(card)).toEqual({
    status: "error",
    message: "Apenas o responsável pelo negócio pode assinar o plano.",
  });

  gateway.rejectNext();
  expect(await actionAs(owner)(card)).toEqual({
    status: "error",
    message: "O Mercado Pago recusou o cartão. Confira os dados ou use outro cartão.",
  });
  await actionAs(owner)(card);
  expect(await actionAs(owner)(card)).toEqual({
    status: "error",
    message: "Este negócio já tem uma assinatura.",
  });
  // Card data never reaches the server: only the Brick's token.
  expect(gateway.created.map(({ cardToken }) => cardToken)).toEqual(["card-token", "card-token"]);
});

test("an unreachable Mercado Pago is reported and the owner asked to try again", async () => {
  const owner = await seedMember("owner");
  const diagnostics = createTestDiagnostics();
  gateway.createSubscription = async () => {
    throw new Error("Mercado Pago unavailable");
  };
  expect(await actionAs(owner, diagnostics)(card)).toEqual({
    status: "error",
    message: "Não foi possível falar com o Mercado Pago agora. Tente de novo em alguns minutos.",
  });
  expect(diagnostics.alerts.map(({ kind }) => kind)).toEqual(["billing_subscribe_failed"]);
});

test("the Brick's last 4 digits are kept with the card, and anything else in their place is dropped", async () => {
  const owner = await seedMember("owner");
  await actionAs(owner)({ ...card, lastFourDigits: "3311" });
  expect(await billing.checkout(owner)).toMatchObject({
    subscription: { card: { brand: "visa", lastFour: "3311" } },
  });

  expect(await changeCardAs(owner)({ ...newCard, lastFourDigits: "4111 1111" })).toMatchObject({
    status: "success",
  });
  expect(await billing.checkout(owner)).toMatchObject({
    subscription: { card: { brand: "master", lastFour: null } },
  });
});

test("changing the card authenticates before reading its input", async () => {
  const action = createChangeCardAction({
    billing,
    requireTenantScope: async () => {
      throw new Error("Unauthorized");
    },
  });
  await expect(action(newCard)).rejects.toThrow("Unauthorized");
});

test("an owner who changes the card is told so, and during a Grace period that the overdue charge is retried on it", async () => {
  const owner = await seedMember("owner");
  await actionAs(owner)(card);
  expect(await changeCardAs(owner)(newCard)).toEqual({
    status: "success",
    message: "Cartão alterado. As próximas cobranças serão feitas no novo cartão.",
  });

  clock.advance(30 * day);
  gateway.payments.set("refused", {
    id: "refused",
    status: "rejected",
    amountCents: 9990,
    createdAt: clock.now(),
    approvedAt: null,
    subscriptionId: "preapproval-1",
    externalReference: null,
  });
  await billing.receiveNotification({ type: "payment", id: "refused" });
  expect(await changeCardAs(owner)(newCard)).toEqual({
    status: "success",
    message:
      "Cartão alterado. A cobrança pendente será feita no novo cartão quando o Mercado Pago tentar de novo.",
  });
});

test("card change refusals and bad input come back in pt-BR", async () => {
  const owner = await seedMember("owner");
  expect(await changeCardAs(owner)(newCard)).toEqual({
    status: "error",
    message: "Este negócio não tem uma assinatura para trocar o cartão.",
  });
  await actionAs(owner)(card);

  expect(await changeCardAs(owner)({ lastFourDigits: "5682" })).toEqual({
    status: "error",
    message: "Preencha os dados do cartão.",
  });
  expect(await changeCardAs(await seedMember("member"))(newCard)).toEqual({
    status: "error",
    message: "Apenas o responsável pelo negócio pode alterar o cartão.",
  });
  gateway.rejectNext();
  expect(await changeCardAs(owner)(newCard)).toEqual({
    status: "error",
    message: "O Mercado Pago recusou o cartão. Confira os dados ou use outro cartão.",
  });
});

test("an unreachable Mercado Pago during a card change is reported and the owner asked to try again", async () => {
  const owner = await seedMember("owner");
  await actionAs(owner)(card);
  const diagnostics = createTestDiagnostics();
  gateway.changeCard = async () => {
    throw new Error("Mercado Pago unavailable");
  };
  expect(await changeCardAs(owner, diagnostics)(newCard)).toEqual({
    status: "error",
    message: "Não foi possível falar com o Mercado Pago agora. Tente de novo em alguns minutos.",
  });
  expect(diagnostics.alerts.map(({ kind }) => kind)).toEqual(["billing_change_card_failed"]);
});

const cancelAs = (scope: TenantScope, diagnostics = createTestDiagnostics()) =>
  createCancelSubscriptionAction({
    billing,
    requireTenantScope: async () => scope,
    diagnostics,
  });

test("cancelling authenticates first", async () => {
  const action = createCancelSubscriptionAction({
    billing,
    requireTenantScope: async () => {
      throw new Error("Unauthorized");
    },
  });
  await expect(action()).rejects.toThrow("Unauthorized");
});

test("an owner who cancels is told the date the Bot stops, and subscribing again waits for it", async () => {
  const owner = await seedMember("owner");
  await actionAs(owner)(card);
  clock.advance(10 * day);

  expect(await cancelAs(owner)()).toEqual({
    status: "success",
    message:
      "Assinatura cancelada. O Mercado Pago não cobra mais o cartão, e o Bot continua respondendo até 31/12/2026.",
  });
});

test("subscribing again within the month already paid for says the first charge waits for its end", async () => {
  const owner = await seedMember("owner");
  await actionAs(owner)(card);
  clock.advance(30 * day);
  gateway.runCharges();
  clock.advance(10 * day);
  await cancelAs(owner)();

  expect(await actionAs(owner)(card)).toEqual({
    status: "success",
    message:
      "Assinatura feita. A primeira cobrança será em 31/01/2027, quando termina o mês já pago.",
  });
});

test("cancelling refusals come back in pt-BR", async () => {
  const owner = await seedMember("owner");
  expect(await cancelAs(owner)()).toEqual({
    status: "error",
    message: "Este negócio não tem uma assinatura para cancelar.",
  });
  await actionAs(owner)(card);
  expect(await cancelAs(await seedMember("member"))()).toEqual({
    status: "error",
    message: "Apenas o responsável pelo negócio pode cancelar a assinatura.",
  });
});

test("an unreachable Mercado Pago while cancelling is reported and the owner asked to try again", async () => {
  const owner = await seedMember("owner");
  await actionAs(owner)(card);
  const diagnostics = createTestDiagnostics();
  gateway.updateSubscription = async () => {
    throw new Error("Mercado Pago unavailable");
  };
  expect(await cancelAs(owner, diagnostics)()).toEqual({
    status: "error",
    message: "Não foi possível falar com o Mercado Pago agora. Tente de novo em alguns minutos.",
  });
  expect(diagnostics.alerts.map(({ kind }) => kind)).toEqual(["billing_cancel_failed"]);
});
