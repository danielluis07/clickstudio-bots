import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { FormState } from "@/server/actions/form-state";

type SecondFactorPasswordFormProps = {
  action: (formData: FormData) => void;
  state: FormState;
  pending: boolean;
};

// Step 1 of the setup: Better Auth asks for the password again.
export function SecondFactorPasswordForm({
  action,
  state,
  pending,
}: SecondFactorPasswordFormProps) {
  return (
    <form action={action}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="password">Senha</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
        <FormMessage state={state} />
        <SubmitButton pending={pending}>Continuar</SubmitButton>
      </FieldGroup>
    </form>
  );
}
