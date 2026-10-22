import { Button } from "@/components/ui/button";
import { conversationFilters } from "@/modules/conversations/hooks";

export function ConversationFilter({
  filter,
  onFilter,
}: {
  filter: string;
  onFilter: (filter: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Filtrar conversas"
      className="flex gap-1 border-b border-border p-2"
    >
      {conversationFilters.map(({ value, label }) => (
        <Button
          key={value}
          type="button"
          size="sm"
          variant={filter === value ? "secondary" : "ghost"}
          aria-pressed={filter === value}
          onClick={() => onFilter(value)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
