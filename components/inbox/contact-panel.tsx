"use client";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useContactEditor } from "@/modules/conversations/hooks";
import type { RouterOutput } from "@/server/trpc/router";
import { useTRPC } from "@/trpc/client";

export function ContactPanel({ conversation }: { conversation: RouterOutput["conversations"]["get"] }) {
  const trpc = useTRPC();
  const form = useContactEditor(trpc.conversations, conversation.contact, conversation.id);
  const errors = form.mutation.error?.data?.zodError?.properties;
  const nameErrors = errors?.name?.errors;
  const phoneErrors = errors?.phone?.errors;
  return (
    <aside className="min-w-0 overflow-y-auto border-t p-5 lg:border-t-0 lg:border-l" aria-label="Detalhes do Contato">
      <h2 className="mb-5 font-semibold">Contato</h2>
      <form onSubmit={form.submit}>
        <FieldGroup>
          <Field data-invalid={Boolean(nameErrors?.length)}>
            <FieldLabel htmlFor="contact-name">Nome</FieldLabel>
            <Input id="contact-name" autoComplete="off" maxLength={120} value={form.name} disabled={form.mutation.isPending}
              aria-invalid={Boolean(nameErrors?.length)} aria-describedby={nameErrors?.length ? "contact-name-error" : undefined}
              onChange={(event) => form.setName(event.target.value)} />
            <FieldError id="contact-name-error">{nameErrors?.join(" ")}</FieldError>
          </Field>
          <Field data-invalid={Boolean(phoneErrors?.length)}>
            <FieldLabel htmlFor="contact-phone">Telefone</FieldLabel>
            <Input id="contact-phone" type="tel" required autoComplete="off" value={form.phone} disabled={form.mutation.isPending}
              aria-invalid={Boolean(phoneErrors?.length)} aria-describedby="contact-phone-hint contact-phone-error"
              onChange={(event) => form.setPhone(event.target.value)} />
            <FieldDescription id="contact-phone-hint">Inclua o código do país e o DDD.</FieldDescription>
            <FieldError id="contact-phone-error">{phoneErrors?.join(" ")}</FieldError>
          </Field>
          <Button type="submit" disabled={form.mutation.isPending}>
            {form.mutation.isPending && <Spinner data-icon="inline-start" />}
            {form.mutation.isPending ? "Salvando…" : "Salvar alterações"}
          </Button>
          {form.mutation.isSuccess && <p role="status" className="text-sm text-muted-foreground">Contato atualizado.</p>}
        </FieldGroup>
      </form>
    </aside>
  );
}
