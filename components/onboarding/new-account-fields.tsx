import { NewPasswordFields } from "@/components/onboarding/new-password-fields";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function NewAccountFields() {
  return (
    <>
      <Field>
        <FieldLabel htmlFor="name">Seu nome</FieldLabel>
        <Input id="name" name="name" autoComplete="name" required maxLength={120} />
      </Field>
      <NewPasswordFields label="Crie uma senha" />
    </>
  );
}
