"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/server/actions/form-state";
import { requireAdmin } from "@/server/auth/guards";
import { createExtendTrialAction } from "@/server/billing-administration";
import { billing } from "@/server/services";

export async function extendTrialAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const state = await createExtendTrialAction({ billing, requireAdmin })(previous, formData);
  if (state.status === "success") revalidatePath("/admin");
  return state;
}
