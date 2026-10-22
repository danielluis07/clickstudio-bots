"use client";

import { ContactDetailInput } from "@/components/inbox/contact-detail-input";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useContactDetailsForm } from "@/modules/conversations/hooks";

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
        {form.inputs.map((input) => (
          <ContactDetailInput
            key={input.field}
            input={input}
            onChange={(value) => form.change(input.field, value)}
          />
        ))}
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
