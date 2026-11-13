import type { ReactNode } from "react";
import { FormMessage } from "@/components/forms/form-message";
import type { FormState } from "@/server/actions/form-state";

// A settings form's save button and result, pinned to the bottom of the
// viewport so it stays in reach on long forms.
export function FormSaveBar({ state, children }: { state: FormState; children: ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-4 mt-2 flex flex-wrap items-center justify-end gap-x-4 gap-y-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="mr-auto min-w-0">
        <FormMessage state={state} />
      </div>
      {children}
    </div>
  );
}
