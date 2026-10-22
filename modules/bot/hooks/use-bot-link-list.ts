"use client";

import { useState } from "react";
import type { ConfiguredLink } from "@/modules/bot/links";

export const useBotLinkList = (initial: ConfiguredLink[]) => {
  const [links, setLinks] = useState(initial);
  return {
    links,
    add: () => setLinks((current) => [...current, { id: crypto.randomUUID(), label: "", url: "" }]),
    update: (id: string, field: "label" | "url", value: string) =>
      setLinks((current) =>
        current.map((link) => (link.id === id ? { ...link, [field]: value } : link)),
      ),
    remove: (id: string) => setLinks((current) => current.filter((link) => link.id !== id)),
  };
};
