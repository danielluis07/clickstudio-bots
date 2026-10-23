"use client";

import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatCount } from "@/lib/format";
import type { KnowledgeEntryKind } from "@/modules/knowledge-base";
import {
  knowledgeEntryLabels,
  useKnowledgeEntryForm,
  type KnowledgeEntryDraft,
} from "@/modules/knowledge-base/hooks";

type KnowledgeEntryFormProps = {
  kind: KnowledgeEntryKind;
  editing: boolean;
  draft: KnowledgeEntryDraft;
  pending: boolean;
  error?: string;
  otherEntriesSize: number;
  cap: number;
  titleMaxLength: number;
  onChange: (draft: KnowledgeEntryDraft) => void;
  onSubmit: (draft: KnowledgeEntryDraft) => void;
  onClose: () => void;
  onDiscard: () => void;
};

export function KnowledgeEntryForm({
  kind,
  editing,
  draft,
  pending,
  error,
  otherEntriesSize,
  cap,
  titleMaxLength,
  onChange,
  onSubmit,
  onClose,
  onDiscard,
}: KnowledgeEntryFormProps) {
  const id = useId();
  const labels = knowledgeEntryLabels[kind];
  const form = useKnowledgeEntryForm({
    draft,
    otherEntriesSize,
    cap,
    titleMaxLength,
    onSubmit,
  });

  return (
    <form onSubmit={form.submit} noValidate aria-busy={pending}>
      <FieldGroup>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Field data-invalid={!!form.titleError || undefined} data-disabled={pending || undefined}>
          <FieldLabel htmlFor={`${id}-title`}>{labels.title}</FieldLabel>
          <Input
            id={`${id}-title`}
            name="title"
            value={draft.title}
            onChange={(event) => onChange({ ...draft, title: event.target.value })}
            aria-invalid={!!form.titleError || undefined}
            aria-describedby={`${id}-title-description`}
            required
            disabled={pending}
          />
          <FieldDescription id={`${id}-title-description`}>
            {form.titleError ?? `Até ${titleMaxLength} caracteres.`}
          </FieldDescription>
        </Field>
        <Field
          data-invalid={form.overCap || !!form.bodyError || undefined}
          data-disabled={pending || undefined}
        >
          <FieldLabel htmlFor={`${id}-body`}>{labels.body}</FieldLabel>
          <Textarea
            id={`${id}-body`}
            name="body"
            value={draft.body}
            onChange={(event) => onChange({ ...draft, body: event.target.value })}
            aria-invalid={form.overCap || !!form.bodyError || undefined}
            aria-describedby={`${id}-allowance`}
            className="min-h-32"
            required
            disabled={pending}
          />
          <FieldDescription id={`${id}-allowance`}>
            {form.bodyError && <span>{form.bodyError} </span>}
            {formatCount(form.total)} / {formatCount(cap)} caracteres na base de conhecimento ao
            salvar. {form.overCap && "Encurte o texto para ficar dentro do limite."}
          </FieldDescription>
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? (
              <>
                <Spinner data-icon="inline-start" aria-hidden="true" />
                Salvando…
              </>
            ) : editing ? (
              "Salvar alterações"
            ) : (
              labels.add
            )}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Fechar
          </Button>
          <Button type="button" variant="ghost" onClick={onDiscard} disabled={pending}>
            Descartar alterações
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
