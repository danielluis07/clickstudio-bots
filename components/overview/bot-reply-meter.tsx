import { cn } from "cn";
import { DashboardRailSection } from "@/components/dashboard/dashboard-rail-section";
import { formatCount } from "@/lib/format";
import type { ReplyUsage } from "@/modules/bot";

// "Respostas do Bot": this calendar month's Bot replies against the limit.
export function BotReplyMeter({ usage }: { usage: ReplyUsage }) {
  const percent = Math.min(100, Math.round((usage.used / usage.limit) * 100));
  return (
    <DashboardRailSection title="Respostas do Bot" aside={`${percent}%`}>
      <p className="text-xl font-semibold tracking-tight tabular-nums">
        {formatCount(usage.used)}
        <span className="text-sm font-normal text-muted-foreground">
          {` / ${formatCount(usage.limit)}`}
        </span>
      </p>
      <div
        role="meter"
        aria-label="Respostas do Bot neste mês"
        aria-valuemin={0}
        aria-valuemax={usage.limit}
        aria-valuenow={Math.min(usage.used, usage.limit)}
        aria-valuetext={`${formatCount(usage.used)} de ${formatCount(usage.limit)}`}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            "h-full rounded-full",
            usage.exhausted ? "bg-destructive" : usage.warning ? "bg-amber-500" : "bg-brand",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        {usage.exhausted
          ? "Limite do mês atingido"
          : usage.warning
            ? `${percent}% do limite deste mês`
            : "Neste mês"}
      </p>
    </DashboardRailSection>
  );
}
