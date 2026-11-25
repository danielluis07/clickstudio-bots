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
    <div role="group" aria-label="Filtrar conversas" className="flex gap-1.5">
      {conversationFilters.map(({ value, label }) => (
        <Button
          key={value}
          type="button"
          size="xs"
          className="rounded-full px-3"
          variant={filter === value ? "default" : "secondary"}
          aria-pressed={filter === value}
          onClick={() => onFilter(value)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
