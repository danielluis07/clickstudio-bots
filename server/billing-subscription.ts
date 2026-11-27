import { z } from "zod";
import type { Billing } from "@/modules/billing";
import type { TenantScope } from "@/modules/tenancy";
import { reportError, type Diagnostics } from "@/platform/diagnostics";
import { formatDate } from "@/platform/format";
import type { FormState } from "@/server/actions/form-state";

// The Brick's token and the payer's email. Card data never reaches us.
const subscription = z.object({
  cardToken: z.string().trim().min(1).max(255),
  payerEmail: z.email().max(254),
});

const errorMessages = {
  forbidden: "Apenas o responsável pelo negócio pode assinar o plano.",
  unavailable: "A cobrança ainda não está configurada neste ambiente.",
  already_subscribed: "Este negócio já tem uma assinatura.",
  card_rejected: "O Mercado Pago recusou o cartão. Confira os dados ou use outro cartão.",
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
        message: cardMissing
          ? "Preencha os dados do cartão."
          : "Informe um e-mail válido para o pagador.",
      };
    }

    let result: Awaited<ReturnType<Billing["subscribe"]>>;
    try {
      result = await billing.subscribe(scope, parsed.data);
    } catch (error) {
      await reportError(diagnostics, "billing_subscribe_failed", error, {
        tenantId: scope.tenantId,
      });
      return {
        status: "error",
        message:
          "Não foi possível falar com o Mercado Pago agora. Tente de novo em alguns minutos.",
      };
    }
    if (!result.ok) return { status: "error", message: errorMessages[result.error] };
    if (result.firstChargeAt)
      return {
        status: "success",
        message: `Assinatura feita. A primeira cobrança será em ${formatDate(result.firstChargeAt)}, quando o teste termina.`,
      };
    return {
      status: "success",
      message: result.suspended
        ? "Assinatura feita. O Bot volta a responder assim que o Mercado Pago aprovar a cobrança."
        : "Assinatura feita. O cartão será cobrado agora.",
    };
  };
