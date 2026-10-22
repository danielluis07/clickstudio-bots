"use client";

import { useActionState, useState } from "react";

type EntryFormState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; message: string };

type SaveEntry = (previous: EntryFormState, formData: FormData) => Promise<EntryFormState>;

// Counts as the server does once it trims the text: characters, not UTF-16
// units. A textarea's value already holds single-character line breaks.
const characterCount = (text: string) => [...text.trim()].length;

// One entry's fields and the Knowledge base size they would make, so the
// owner sees the allowance before saving. The server still enforces it.
export const useKnowledgeEntryForm = ({
  save,
  initial,
  otherEntriesSize,
  cap,
  onSaved,
}: {
  save: SaveEntry;
  initial: { title: string; body: string };
  // Characters taken by every other entry.
  otherEntriesSize: number;
  cap: number;
  onSaved?: () => void;
}) => {
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [state, formAction, pending] = useActionState<EntryFormState, FormData>(
    async (previous, formData) => {
      const next = await save(previous, formData);
      if (next.status === "success") {
        setTitle(initial.title);
        setBody(initial.body);
        onSaved?.();
      }
      return next;
    },
    { status: "idle" },
  );

  const total = otherEntriesSize + characterCount(title) + characterCount(body);
  return {
    title,
    setTitle,
    body,
    setBody,
    total,
    overCap: total > cap,
    state,
    formAction,
    pending,
  };
};
