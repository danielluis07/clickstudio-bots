import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function NewAccountFields() {
  return (
    <>
      <Field>
        <FieldLabel htmlFor="name">Seu nome</FieldLabel>
        <Input id="name" name="name" autoComplete="name" required maxLength={120} />
      </Field>
      <Field>
        <FieldLabel htmlFor="password">
          Crie uma senha
        </FieldLabel>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} />
        <FieldDescription>Use pelo menos 8 caracteres.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="passwordConfirmation">
          Confirme a senha
        </FieldLabel>
        <Input id="passwordConfirmation" name="passwordConfirmation" type="password" autoComplete="new-password" required minLength={8} maxLength={128} />
      </Field>
    </>
  );
}
