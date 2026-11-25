"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useDebouncedInput } from "@/hooks/use-debounced-input";

export function ConversationSearch({
  search,
  onSearch,
}: {
  search: string;
  onSearch: (search: string) => void;
}) {
  const input = useDebouncedInput(search, onSearch);

  return (
    <div className="relative">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        aria-label="Buscar por nome ou telefone"
        placeholder="Buscar por nome ou telefone"
        maxLength={100}
        className="h-9 rounded-full border-transparent bg-muted pl-9 dark:bg-muted"
        {...input}
      />
    </div>
  );
}
