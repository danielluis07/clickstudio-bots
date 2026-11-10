"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/server/actions/form-state";
import { requireAdmin } from "@/server/auth/guards";
import { createReplayFailuresAction, createReplayInboxAction } from "@/server/inbox-administration";
import { webhookInbox } from "@/server/services";

export async function replayInboxEventAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const state = await createReplayInboxAction({ inbox: webhookInbox, requireAdmin })(
    previous,
    formData,
  );
  if (state.status === "success") revalidatePath("/admin/eventos");
  return state;
}

export async function replayInboxFailuresAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const state = await createReplayFailuresAction({ inbox: webhookInbox, requireAdmin })(
    previous,
    formData,
  );
  if (state.status === "success") revalidatePath("/admin/eventos");
  return state;
}
