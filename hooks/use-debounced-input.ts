"use client";

import { useState, type ChangeEvent } from "react";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";

// A text input that reports its value once typing pauses. When `value`
// changes from elsewhere, such as back/forward navigation, the input follows.
export function useDebouncedInput(value: string, onSettle: (value: string) => void, delay = 300) {
  const [draft, setDraft] = useState(value);
  const [settled, setSettled] = useState(value);
  const settleSoon = useDebouncedCallback(onSettle, delay);

  if (value !== settled) {
    setSettled(value);
    if (value !== draft.trim()) setDraft(value);
  }

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDraft(event.target.value);
    settleSoon(event.target.value);
  };

  return { value: draft, onChange };
}
