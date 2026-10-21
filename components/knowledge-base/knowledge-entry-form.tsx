"use client";

import { useId } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatCount } from "@/lib/format";
import type { KnowledgeEntryKind } from "@/modules/knowledge-base";
import { knowledgeEntryLabels, useKnowledgeEntryForm } from "@/modules/knowledge-base/hooks";
import { saveKnowledgeEntryAction } from "@/server/actions/knowledge-base";

type KnowledgeEntryFormProps = {
  kind: KnowledgeEntryKind;
  // The entry being edited; absent when adding one.
  entry?: { id: string; title: string; body: string };
  otherEntriesSize: number;
  cap: number;
  titleMaxLength: number;
  onSaved?: () => void;
  onCancel?: () => void;
};

export function KnowledgeEntryForm({ kind, entry, otherEntriesSize, cap, titleMaxLength, onSaved, onCancel }: KnowledgeEntryFormProps) {
  const id = useId();
  const labels = knowledgeEntryLabels[kind];
  const form = useKnowledgeEntryForm({
    save: saveKnowledgeEntryAction,
    initial: { title: entry?.title ?? "", body: entry?.body ?? "" },
    otherEntriesSize,
    cap,
    onSaved,
  });

  return (
    <form action={form.formAction}>
      {entry ? <input type="hidden" name="entryId" value={entry.id} /> : <input type="hidden" name="kind" value={kind} />}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${id}-title`}>{labels.title}</FieldLabel>
          <Input
            id={`${id}-title`}
            name="title"
            value={form.title}
            onChange={(event) => form.setTitle(event.target.value)}
            maxLength={titleMaxLength}
            required
          />
        </Field>
        <Field data-invalid={form.overCap || undefined}>
          <FieldLabel htmlFor={`${id}-body`}>{labels.body}</FieldLabel>
          <Textarea
            id={`${id}-body`}
            name="body"
            value={form.body}
            onChange={(event) => form.setBody(event.target.value)}
            aria-invalid={form.overCap || undefined}
            aria-describedby={`${id}-allowance`}
            className="min-h-32"
            required
          />
          <FieldDescription id={`${id}-allowance`} className={form.overCap ? "text-destructive" : undefined}>
            {formatCount(form.total)} / {formatCount(cap)} caracteres na base de conhecimento ao salvar
          </FieldDescription>
        </Field>
        <FormMessage state={form.state} />
        <div className="flex flex-wrap gap-2">
          <SubmitButton pending={form.pending}>{entry ? "Salvar alterações" : labels.add}</SubmitButton>
          {onCancel && (
            <Button type="button" variant="ghost" size="lg" onClick={onCancel} disabled={form.pending}>
              Cancelar
            </Button>
          )}
        </div>
      </FieldGroup>
    </form>
  );
}
