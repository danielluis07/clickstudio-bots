"use client";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useContactEditor } from "@/modules/conversations/hooks";
import type { ConversationDetails } from "@/modules/conversations";

export function ContactPanel({ conversation }: { conversation: ConversationDetails }) {
  const form = useContactEditor(conversation.contact, conversation.id);
  return (
    <aside className="min-w-0 overflow-y-auto border-t p-5 lg:border-t-0 lg:border-l" aria-label="Detalhes do Contato">
      <h2 className="mb-5 font-semibold">Contato</h2>
      <form onSubmit={form.submit}>
        <FieldGroup>
          <Field data-invalid={Boolean(form.fieldErrors.name)}>
            <FieldLabel htmlFor="contact-name">Nome</FieldLabel>
            <Input id="contact-name" autoComplete="off" maxLength={120} value={form.name} disabled={form.isPending}
              aria-invalid={Boolean(form.fieldErrors.name)} aria-describedby={form.fieldErrors.name ? "contact-name-error" : undefined}
              onChange={(event) => form.setName(event.target.value)} />
            <FieldError id="contact-name-error">{form.fieldErrors.name}</FieldError>
          </Field>
          <Field data-invalid={Boolean(form.fieldErrors.phone)}>
            <FieldLabel htmlFor="contact-phone">Telefone</FieldLabel>
            <Input id="contact-phone" type="tel" required autoComplete="off" value={form.phone} disabled={form.isPending}
              aria-invalid={Boolean(form.fieldErrors.phone)} aria-describedby="contact-phone-hint contact-phone-error"
              onChange={(event) => form.setPhone(event.target.value)} />
            <FieldDescription id="contact-phone-hint">Inclua o código do país e o DDD.</FieldDescription>
            <FieldError id="contact-phone-error">{form.fieldErrors.phone}</FieldError>
          </Field>
          <Button type="submit" disabled={form.isPending}>
            {form.isPending && <Spinner data-icon="inline-start" />}
            {form.isPending ? "Salvando…" : "Salvar alterações"}
          </Button>
          {form.isSuccess && <p role="status" className="text-sm text-muted-foreground">Contato atualizado.</p>}
        </FieldGroup>
      </form>
    </aside>
  );
}
