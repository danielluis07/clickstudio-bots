import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function ExistingAccountFields() {
  return (
    <Field>
      <FieldLabel htmlFor="password">
        Senha da sua conta
      </FieldLabel>
      <Input id="password" name="password" type="password" autoComplete="current-password" required />
      <FieldDescription>Este e-mail já tem uma conta. Confirme a senha atual para aceitar o convite.</FieldDescription>
    </Field>
  );
}
