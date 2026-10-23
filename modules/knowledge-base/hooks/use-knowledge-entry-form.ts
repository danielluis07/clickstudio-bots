"use client";

import { useState, type FormEvent } from "react";
import { characterCount, entrySize } from "@/modules/knowledge-base/allowance";
import { normalizeEntryText } from "@/modules/knowledge-base/text";
import type { KnowledgeEntryDraft } from "@/modules/knowledge-base/hooks/use-knowledge-base-editor";

export const useKnowledgeEntryForm = ({
  draft,
  otherEntriesSize,
  cap,
  titleMaxLength,
  onSubmit,
}: {
  draft: KnowledgeEntryDraft;
  otherEntriesSize: number;
  cap: number;
  titleMaxLength: number;
  onSubmit: (text: KnowledgeEntryDraft) => void;
}) => {
  const [attempted, setAttempted] = useState(false);
  const text = { title: normalizeEntryText(draft.title), body: normalizeEntryText(draft.body) };
  const total = otherEntriesSize + entrySize(text);
  const titleError = !text.title
    ? "Preencha este campo."
    : characterCount(text.title) > titleMaxLength
      ? `Use até ${titleMaxLength} caracteres.`
      : null;
  const bodyError = !text.body ? "Preencha este campo." : null;
  const overCap = total > cap;
  return {
    total,
    overCap,
    titleError: attempted ? titleError : null,
    bodyError: attempted ? bodyError : null,
    submit: (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setAttempted(true);
      if (titleError || bodyError || overCap) {
        const field = titleError ? "title" : "body";
        event.currentTarget.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
        return;
      }
      onSubmit(text);
    },
  };
};
