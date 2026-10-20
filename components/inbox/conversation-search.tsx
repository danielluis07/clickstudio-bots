"use client";

import { Input } from "@/components/ui/input";
import { useDebouncedInput } from "@/hooks/use-debounced-input";

export function ConversationSearch({ search, onSearch }: { search: string; onSearch: (search: string) => void }) {
  const input = useDebouncedInput(search, onSearch);

  return (
    <div className="border-b border-border p-3">
      <Input
        type="search"
        aria-label="Buscar por nome ou telefone"
        placeholder="Buscar por nome ou telefone"
        maxLength={100}
        {...input}
      />
    </div>
  );
}
