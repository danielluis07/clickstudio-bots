import type { FormState } from "@/lib/actions/form-state";

export function FormMessage({ state }: { state: FormState }) {
  if (state.status === "idle") return null;

  return (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className={
        state.status === "error"
          ? "text-sm wrap-break-word text-destructive"
          : "text-sm wrap-break-word text-primary"
      }>
      {state.message}
    </p>
  );
}
