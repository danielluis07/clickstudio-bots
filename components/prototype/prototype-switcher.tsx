"use client";

// PROTOTYPE (throwaway): floating bar that flips between design variants via
// ?variant=. Never ships: hidden in production builds.
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useEffect } from "react";

type PrototypeSwitcherProps = {
  variants: { key: string; name: string }[];
  current: string;
  onChange: (key: string) => void;
};

export function PrototypeSwitcher({ variants, current, onChange }: PrototypeSwitcherProps) {
  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  );
  const step = (by: number) =>
    onChange(variants[(index + by + variants.length) % variants.length]!.key);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest("input, textarea, select, [contenteditable], [role='slider']") ||
        event.altKey ||
        event.metaKey ||
        event.ctrlKey
      )
        return;
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (process.env.NODE_ENV === "production") return null;

  const variant = variants[index]!;
  return (
    <div className="fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full bg-zinc-950 p-1 text-zinc-50 shadow-2xl ring-1 ring-white/20">
      <button
        type="button"
        aria-label="Variante anterior"
        onClick={() => step(-1)}
        className="flex size-8 items-center justify-center rounded-full hover:bg-white/15"
      >
        <ChevronLeftIcon className="size-4" />
      </button>
      <span className="min-w-52 px-2 text-center text-sm tabular-nums">
        <span className="font-semibold">{variant.key.toUpperCase()}</span>{" "}
        <span className="text-zinc-400">({variant.name})</span>{" "}
        <span className="text-xs text-zinc-500">
          {index + 1}/{variants.length}
        </span>
      </span>
      <button
        type="button"
        aria-label="Próxima variante"
        onClick={() => step(1)}
        className="flex size-8 items-center justify-center rounded-full hover:bg-white/15"
      >
        <ChevronRightIcon className="size-4" />
      </button>
    </div>
  );
}
