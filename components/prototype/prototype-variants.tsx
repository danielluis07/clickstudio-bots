"use client";

// PROTOTYPE (throwaway): renders the variant named by ?variant= and the
// floating switcher. The server renders every variant's tree; only the chosen
// one mounts.
import type { ReactNode } from "react";
import { PrototypeSwitcher } from "@/components/prototype/prototype-switcher";
import { useSearchParam } from "@/hooks/use-search-param";

export type PrototypeVariant = { key: string; name: string; content: ReactNode };

export function PrototypeVariants({ variants }: { variants: PrototypeVariant[] }) {
  const [value, setValue] = useSearchParam("variant", { history: "replace" });
  const current = variants.find((variant) => variant.key === value) ?? variants[0]!;

  return (
    <>
      <div key={current.key}>{current.content}</div>
      <PrototypeSwitcher
        variants={variants.map(({ key, name }) => ({ key, name }))}
        current={current.key}
        onChange={setValue}
      />
    </>
  );
}
