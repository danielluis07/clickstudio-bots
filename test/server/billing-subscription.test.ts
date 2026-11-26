import { afterEach, beforeEach, expect, test } from "bun:test";
import type { Database } from "@/db/database";
import { member, organization, user } from "@/db/schema";
import { createBilling, type Billing } from "@/modules/billing";
import { resolveTenantScope, type TenantScope } from "@/modules/tenancy";
import { createSubscribeAction } from "@/server/billing-subscription";
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
