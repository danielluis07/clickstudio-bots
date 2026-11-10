import { Check, CheckCheck, CircleAlert, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { messageFailureReason, messageStatusLabels } from "@/modules/conversations/hooks";

type Status = keyof typeof messageStatusLabels;

const icons = {
  pending: Clock,
  sent: Check,
  delivered: CheckCheck,
  read: CheckCheck,
  failed: CircleAlert,
};

export function MessageStatus({
  status,
  failureCode,
}: {
  status: Status;
  failureCode: number | null;
}) {
  const Icon = icons[status];
  const reason = status === "failed" ? messageFailureReason(failureCode) : null;
  const label = reason ? `${messageStatusLabels[status]}: ${reason}` : messageStatusLabels[status];

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center gap-1",
        status === "read" && "text-sky-600 dark:text-sky-400",
        status === "failed" && "text-destructive",
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {status === "failed" && label}
    </span>
  );
}
