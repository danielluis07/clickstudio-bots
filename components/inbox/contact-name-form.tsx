"use client";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useContactNameForm } from "@/modules/conversations/hooks";

type ContactNameFormProps = {
  contact: { id: string; name: string | null; appName: string | null; profileName: string | null };
};

export function ContactNameForm({ contact }: ContactNameFormProps) {
  const { name, changeName, submit, saving, failed, saved } = useContactNameForm(contact);

  return (
    <form onSubmit={submit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="contact-name">Nome</FieldLabel>
          <Input
            id="contact-name"
            maxLength={100}
            autoComplete="off"
            placeholder={contact.appName ?? contact.profileName ?? "Sem nome"}
            value={name}
            onChange={(event) => changeName(event.target.value)}
          />
          <FieldDescription>Deixe em branco para usar o nome do WhatsApp.</FieldDescription>
        </Field>
        {failed && <p role="alert" className="text-sm text-destructive">Não foi possível salvar o nome.</p>}
        {saved && <p role="status" className="text-sm text-primary">Nome salvo.</p>}
        <Button type="submit" disabled={saving}>
          {saving && <Spinner />}
          Salvar nome
        </Button>
      </FieldGroup>
    </form>
  );
}
