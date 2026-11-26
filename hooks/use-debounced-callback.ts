"use client";

import { useCallback, useEffect, useRef } from "react";

// Calls the latest callback once calls stop for `delay` milliseconds. The
// second function drops a call still waiting.
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delay: number,
) {
  const latest = useRef(callback);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    latest.current = callback;
  });

  useEffect(() => () => clearTimeout(timer.current), []);

  const debounced = useCallback(
    (...args: Args) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => latest.current(...args), delay);
    },
    [delay],
  );
  const cancel = useCallback(() => clearTimeout(timer.current), []);

  return [debounced, cancel] as const;
}
