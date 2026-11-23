import { Bot, Smartphone, UserRound } from "lucide-react";
import { MessageHeader } from "@/components/ui/message";

const icons = { bot: Bot, dashboard: UserRound, app: Smartphone };

// Who wrote a reply, above its bubble. The Contact's own messages have none.
export function MessageAuthor({
  origin,
  label,
}: {
  origin: "dashboard" | "app" | "bot";
  label: string;
}) {
  const Icon = icons[origin];
  return (
    <MessageHeader className="gap-1.5 wrap-anywhere">
      <Icon aria-hidden className="size-3.5 shrink-0 text-brand" />
      {label}
    </MessageHeader>
  );
}
