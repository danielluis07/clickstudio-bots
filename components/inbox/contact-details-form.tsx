"use client";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { contactDetailInputs, useContactDetailsForm } from "@/modules/conversations/hooks";

type ContactDetailsFormProps = {
  contact: {
    id: string;
    name: string | null;
    appName: string | null;
    profileName: string | null;
    email: string | null;
    city: string | null;
    need: string | null;
  };
};

export function ContactDetailsForm({ contact }: ContactDetailsFormProps) {
  const form = useContactDetailsForm(contact);

  return (
    <form onSubmit={form.submit}>
      <FieldGroup>
        {contactDetailInputs.map(({ field, label, placeholder, maxLength }) => {
          const props = {
            id: `contact-${field}`,
            maxLength,
            autoComplete: "off",
            placeholder:
              field === "name"
                ? (contact.appName ?? contact.profileName ?? placeholder)
                : placeholder,
            value: form.details[field],
            onChange: (event: { target: { value: string } }) =>
              form.change(field, event.target.value),
          };
          return (
            <Field key={field}>
              <FieldLabel htmlFor={props.id}>{label}</FieldLabel>
              {field === "need" ? (
                <Textarea rows={3} {...props} />
              ) : (
                <Input type={field === "email" ? "email" : "text"} {...props} />
              )}
              {field === "name" && (
                <FieldDescription>Deixe em branco para usar o nome do WhatsApp.</FieldDescription>
              )}
            </Field>
          );
        })}
        {form.failed && (
          <p role="alert" className="text-sm text-destructive">
            {form.invalid
              ? "Confira os dados: o e-mail precisa ser válido."
              : "Não foi possível salvar os dados."}
          </p>
        )}
        {form.saved && (
          <p role="status" className="text-sm text-primary">
            Dados salvos.
          </p>
        )}
        <Button type="submit" disabled={form.saving}>
          {form.saving && <Spinner />}
          Salvar dados
        </Button>
      </FieldGroup>
    </form>
  );
}
