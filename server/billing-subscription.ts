import { z } from "zod";
import type { Billing } from "@/modules/billing";
import type { TenantScope } from "@/modules/tenancy";
import { reportError, type Diagnostics } from "@/platform/diagnostics";
import { formatDate } from "@/platform/format";
import type { FormState } from "@/server/actions/form-state";

// The Brick's token, and the last 4 digits it showed, kept only to show the
// owner which card pays (anything else in their place is dropped). Card data
// never reaches us.
const brickCard = z.object({
  cardToken: z.string().trim().min(1).max(255),
  lastFourDigits: z
    .string()
    .regex(/^\d{4}$/)
    .nullish()
    .catch(null),
});

// A new Subscription also takes the payer's email.
const subscription = brickCard.extend({ payerEmail: z.email().max(254) });

const cardMissingMessage = "Preencha os dados do cartão.";
const unreachableMessage =
  "Não foi possível falar com o Mercado Pago agora. Tente de novo em alguns minutos.";

const errorMessages = {
  forbidden: "Apenas o responsável pelo negócio pode assinar o plano.",
  unavailable: "A cobrança ainda não está configurada neste ambiente.",
  already_subscribed: "Este negócio já tem uma assinatura.",
  card_rejected: "O Mercado Pago recusou o cartão. Confira os dados ou use outro cartão.",
} as const;

const changeCardErrorMessages = {
  ...errorMessages,
  forbidden: "Apenas o responsável pelo negócio pode alterar o cartão.",
  no_subscription: "Este negócio não tem uma assinatura para trocar o cartão.",
} as const;

const cancelErrorMessages = {
  forbidden: "Apenas o responsável pelo negócio pode cancelar a assinatura.",
  unavailable: errorMessages.unavailable,
  no_subscription: "Este negócio não tem uma assinatura para cancelar.",
} as const;

// Subscribes the owner's Tenant with the card token from the Card Payment
// Brick. `billing.subscribe` re-checks that the caller may.
export const createSubscribeAction =
  ({
    billing,
    requireTenantScope,
    diagnostics,
  }: {
    billing: Pick<Billing, "subscribe">;
    requireTenantScope: () => Promise<TenantScope>;
    diagnostics?: Diagnostics;
  }) =>
  async (input: unknown): Promise<FormState> => {
    const scope = await requireTenantScope();
    const parsed = subscription.safeParse(input);
    if (!parsed.success) {
      const cardMissing = parsed.error.issues.some(({ path }) => path[0] === "cardToken");
      return {
        status: "error",
        message: cardMissing ? cardMissingMessage : "Informe um e-mail válido para o pagador.",
      };
    }

    let result: Awaited<ReturnType<Billing["subscribe"]>>;
    try {
      result = await billing.subscribe(scope, parsed.data);
    } catch (error) {
      await reportError(diagnostics, "billing_subscribe_failed", error, {
        tenantId: scope.tenantId,
      });
      return { status: "error", message: unreachableMessage };
    }
    if (!result.ok) return { status: "error", message: errorMessages[result.error] };
    if (result.firstChargeAt)
      return {
        status: "success",
        message: `Assinatura feita. A primeira cobrança será em ${formatDate(result.firstChargeAt)}, ${result.afterPaidMonth ? "quando termina o mês já pago" : "quando o teste termina"}.`,
      };
    return {
      status: "success",
      message: result.suspended
        ? "Assinatura feita. O Bot volta a responder assim que o Mercado Pago aprovar a cobrança."
        : "Assinatura feita. O cartão será cobrado agora.",
    };
  };

// "Alterar cartão": replaces the card of the owner's Subscription with the
// card token from the Card Payment Brick. `billing.changeCard` re-checks that
// the caller may.
export const createChangeCardAction =
  ({
    billing,
    requireTenantScope,
    diagnostics,
  }: {
    billing: Pick<Billing, "changeCard">;
    requireTenantScope: () => Promise<TenantScope>;
    diagnostics?: Diagnostics;
  }) =>
  async (input: unknown): Promise<FormState> => {
    const scope = await requireTenantScope();
    const parsed = brickCard.safeParse(input);
    if (!parsed.success) return { status: "error", message: cardMissingMessage };

    let result: Awaited<ReturnType<Billing["changeCard"]>>;
    try {
      result = await billing.changeCard(scope, parsed.data);
    } catch (error) {
      await reportError(diagnostics, "billing_change_card_failed", error, {
        tenantId: scope.tenantId,
      });
      return { status: "error", message: unreachableMessage };
    }
    if (!result.ok) return { status: "error", message: changeCardErrorMessages[result.error] };
    return {
      status: "success",
      message: result.overdue
        ? "Cartão alterado. A cobrança pendente será feita no novo cartão quando o Mercado Pago tentar de novo."
        : "Cartão alterado. As próximas cobranças serão feitas no novo cartão.",
    };
  };

// Cancels the owner's Subscription, after the billing page's confirmation.
// `billing.cancelSubscription` re-checks that the caller may.
export const createCancelSubscriptionAction =
  ({
    billing,
    requireTenantScope,
    diagnostics,
  }: {
    billing: Pick<Billing, "cancelSubscription">;
    requireTenantScope: () => Promise<TenantScope>;
    diagnostics?: Diagnostics;
  }) =>
  async (): Promise<FormState> => {
    const scope = await requireTenantScope();

    let result: Awaited<ReturnType<Billing["cancelSubscription"]>>;
    try {
      result = await billing.cancelSubscription(scope);
    } catch (error) {
      await reportError(diagnostics, "billing_cancel_failed", error, {
        tenantId: scope.tenantId,
      });
      return { status: "error", message: unreachableMessage };
    }
    if (!result.ok) return { status: "error", message: cancelErrorMessages[result.error] };
    return {
      status: "success",
      message: result.endsAt
        ? `Assinatura cancelada. O Mercado Pago não cobra mais o cartão, e o Bot continua respondendo até ${formatDate(result.endsAt)}.`
        : "Assinatura cancelada. O Mercado Pago não cobra mais o cartão.",
    };
  };
