"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type TourContextValue = {
  // The Tour is on screen: the sidebar shows every area it points at.
  running: boolean;
  setRunning: (running: boolean) => void;
  // "Ver tour" was clicked: the overview starts the Tour once it is shown.
  replayRequested: boolean;
  requestReplay: () => void;
  clearReplay: () => void;
};

const TourContext = createContext<TourContextValue>({
  running: false,
  setRunning: () => {},
  replayRequested: false,
  requestReplay: () => {},
  clearReplay: () => {},
});

// Mounted once in the dashboard shell, so "Ver tour" in the sidebar and the
// Tour on the overview share it across pages.
export function TourProvider({ children }: { children: ReactNode }) {
  const [running, setRunning] = useState(false);
  const [replayRequested, setReplayRequested] = useState(false);
  const requestReplay = useCallback(() => setReplayRequested(true), []);
  const clearReplay = useCallback(() => setReplayRequested(false), []);
  const value = useMemo(
    () => ({ running, setRunning, replayRequested, requestReplay, clearReplay }),
    [running, replayRequested, requestReplay, clearReplay],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export const useTour = () => useContext(TourContext);
