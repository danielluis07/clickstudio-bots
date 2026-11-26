"use client";

import { useRef } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useDebouncedInput } from "@/hooks/use-debounced-input";

export function ConversationSearch({
  search,
  onSearch,
}: {
  search: string;
  onSearch: (search: string) => void;
}) {
  const { value, onChange, clear } = useDebouncedInput(search, onSearch);
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="relative">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        ref={input}
        type="text"
        aria-label="Buscar por nome ou telefone"
        placeholder="Buscar por nome ou telefone"
        maxLength={100}
        autoComplete="off"
        className="h-9 rounded-full border-transparent bg-muted pr-9 pl-9 dark:bg-muted"
        value={value}
        onChange={onChange}
      />
      {value && (
        <button
          type="button"
          aria-label="Limpar busca"
          className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onClick={() => {
            clear();
            input.current?.focus();
          }}
        >
          <X aria-hidden className="size-4" />
        </button>
      )}
    </div>
  );
}
