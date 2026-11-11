import { cn } from "cn";
import { StatTile } from "@/components/overview/stat-tile";
import { formatCount } from "@/lib/format";
import type { ReplyUsage } from "@/modules/bot";

// "Respostas do Bot": this calendar month's Bot replies against the limit.
export function BotReplyMeter({ usage }: { usage: ReplyUsage }) {
  const percent = Math.min(100, Math.round((usage.used / usage.limit) * 100));
  return (
    <StatTile
      label="Respostas do Bot"
      value={
        <>
          {formatCount(usage.used)}
          <span className="text-sm font-normal text-muted-foreground">
            {` / ${formatCount(usage.limit)}`}
          </span>
        </>
      }
      caption={
        usage.exhausted
          ? "Limite do mês atingido"
          : usage.warning
            ? `${percent}% do limite deste mês`
            : "Neste mês"
      }
    >
      <dd
        role="meter"
        aria-label="Respostas do Bot neste mês"
        aria-valuemin={0}
        aria-valuemax={usage.limit}
        aria-valuenow={Math.min(usage.used, usage.limit)}
        aria-valuetext={`${formatCount(usage.used)} de ${formatCount(usage.limit)}`}
        className="my-1 h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            "h-full rounded-full",
            usage.exhausted ? "bg-destructive" : usage.warning ? "bg-amber-500" : "bg-brand",
          )}
          style={{ width: `${percent}%` }}
        />
      </dd>
    </StatTile>
  );
}
