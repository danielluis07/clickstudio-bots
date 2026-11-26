"use client";

import { useState, type ChangeEvent } from "react";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";

// A text input that reports its value once typing pauses. When `value`
// changes from elsewhere, such as back/forward navigation, the input follows.
// Spread `value` and `onChange` onto the input; `clear` empties it.
export function useDebouncedInput(value: string, onSettle: (value: string) => void, delay = 300) {
  const [draft, setDraft] = useState(value);
  const [settled, setSettled] = useState(value);
  const [settleSoon, cancelSettle] = useDebouncedCallback(onSettle, delay);

  if (value !== settled) {
    setSettled(value);
    if (value !== draft.trim()) setDraft(value);
  }

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDraft(event.target.value);
    settleSoon(event.target.value);
  };

  // Empties the input and reports it at once, dropping any pending report.
  const clear = () => {
    cancelSettle();
    setDraft("");
    onSettle("");
  };

  return { value: draft, onChange, clear };
}
