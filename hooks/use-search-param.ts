"use client";

import { useSearchParams } from "next/navigation";
import { useCallback } from "react";

// One URL search param as state, trimmed. Writes go through the History API,
// which Next.js syncs into useSearchParams without a server round trip.
export function useSearchParam(name: string, { history = "push" }: { history?: "push" | "replace" } = {}) {
  const value = useSearchParams().get(name)?.trim() ?? "";

  const setValue = useCallback((next: string) => {
    const params = new URLSearchParams(window.location.search);
    if (next.trim()) params.set(name, next.trim());
    else params.delete(name);
    const query = params.toString();
    const url = query ? `?${query}` : window.location.pathname;
    if (history === "push") window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  }, [name, history]);

  return [value, setValue] as const;
}
