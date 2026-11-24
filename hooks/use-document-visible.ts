"use client";

import { useSyncExternalStore } from "react";

const subscribe = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};

// Whether the tab is in front. The server render counts it as hidden.
export const useDocumentVisible = () =>
  useSyncExternalStore(
    subscribe,
    () => document.visibilityState === "visible",
    () => false,
  );
