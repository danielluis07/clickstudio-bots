"use client";

import { useEffect, useState } from "react";

// Whether `deadline` is still ahead, turning false on screen when it passes.
// Null is never ahead.
export const useBefore = (deadline: Date | null) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!deadline) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(deadline.getTime() - Date.now(), 0),
    );
    return () => clearTimeout(timer);
  }, [deadline]);

  return deadline !== null && deadline.getTime() > now;
};
