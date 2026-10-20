import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function NewPasswordFields({ label }: { label: string }) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor="password">{label}</FieldLabel>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} />
        <FieldDescription>Use pelo menos 8 caracteres.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="passwordConfirmation">Confirme a senha</FieldLabel>
        <Input id="passwordConfirmation" name="passwordConfirmation" type="password" autoComplete="new-password" required minLength={8} maxLength={128} />
      </Field>
    </>
  );
}
