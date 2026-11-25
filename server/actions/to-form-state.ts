import { refresh } from "next/cache";
import type { FormState } from "@/server/actions/form-state";

type RefusalOf<R> = Extract<R, { ok: false }> extends { error: infer E extends string } ? E : never;

// Turns a module result into the FormState a Server Action returns: the
// pt-BR message for its refusal, or the success message after refreshing the
// page's data. `errors` must name every refusal the result can carry. Actions
// with their own flow (a fallback e-mail, a re-check) stay explicit.
//
// Lives apart from form-state.ts: client components import that file, and
// `next/cache` must stay out of the browser bundle.
export const toFormState = <R extends { ok: boolean }>(
  result: R,
  errors: Record<RefusalOf<R>, string>,
  successMessage: string,
): FormState => {
  if (!result.ok) {
    const { error } = result as unknown as { error: RefusalOf<R> };
    return { status: "error", message: errors[error] };
  }
  refresh();
  return { status: "success", message: successMessage };
};
