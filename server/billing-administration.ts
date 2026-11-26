import { z } from "zod";
import type { Billing } from "@/modules/billing";
import { formatLastDay } from "@/platform/format";
import { endOfLocalDate } from "@/platform/time";
import { formText, type FormState } from "@/server/actions/form-state";

type AdminGuard = () => Promise<{ user: { id: string } }>;

const extension = z.object({ tenantId: z.string().min(1), trialEndsOn: z.iso.date() });

const errorMessages = {
  forbidden: "Você não tem permissão para estender períodos de teste.",
  billing_disabled: "A cobrança está desligada neste ambiente.",
  not_future: "Escolha uma data a partir de hoje.",
  not_found: "Negócio não encontrado.",
  subscribed: "Este negócio já tem uma assinatura ativa.",
} as const;

// Extends one Tenant's Trial through the chosen day (`trialEndsOn`,
// "YYYY-MM-DD"): it ends at the following midnight in Brasília.
export const createExtendTrialAction =
  ({ billing, requireAdmin }: { billing: Billing; requireAdmin: AdminGuard }) =>
  async (_previous: FormState, formData: FormData): Promise<FormState> => {
    const { user } = await requireAdmin();
    const parsed = extension.safeParse({
      tenantId: formText(formData, "tenantId"),
      trialEndsOn: formText(formData, "trialEndsOn"),
    });
    if (!parsed.success) return { status: "error", message: "Informe uma data válida." };
    const { tenantId, trialEndsOn } = parsed.data;
    const result = await billing.extendTrial(user.id, tenantId, endOfLocalDate(trialEndsOn));
    if (!result.ok) return { status: "error", message: errorMessages[result.error] };
    return {
      status: "success",
      message: `O teste de ${result.tenantName} vai até ${formatLastDay(result.trialEndsAt)}.`,
    };
  };
