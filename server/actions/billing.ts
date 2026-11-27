"use server";

import { refresh, revalidatePath } from "next/cache";
import type { BrickCard } from "@/modules/billing";
import type { FormState } from "@/server/actions/form-state";
import { requireAdmin, requireTenantScope } from "@/server/auth/guards";
import { createExtendTrialAction } from "@/server/billing-administration";
import { createChangeCardAction, createSubscribeAction } from "@/server/billing-subscription";
import { billing, diagnostics } from "@/server/services";

// Called by the Card Payment Brick with its token; never with card data.
export async function subscribeAction(
  input: BrickCard & { payerEmail: string },
): Promise<FormState> {
  const state = await createSubscribeAction({ billing, requireTenantScope, diagnostics })(input);
  if (state.status === "success") refresh();
  return state;
}

// "Alterar cartão", called by the Card Payment Brick with its token.
export async function changeCardAction(input: BrickCard): Promise<FormState> {
  const state = await createChangeCardAction({ billing, requireTenantScope, diagnostics })(input);
  if (state.status === "success") refresh();
  return state;
}

export async function extendTrialAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const state = await createExtendTrialAction({ billing, requireAdmin })(previous, formData);
  if (state.status === "success") revalidatePath("/admin");
  return state;
}
