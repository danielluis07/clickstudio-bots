import { cn } from "cn";
import { DashboardRailSection } from "@/components/dashboard/dashboard-rail-section";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCount } from "@/lib/format";

// "Testes hoje": the owner's sandbox messages today against the daily limit.
// No allowance is still loading.
export function BotSandboxAllowance({
  allowance,
}: {
  allowance: { used: number; limit: number } | undefined;
}) {
  if (!allowance)
    return (
      <DashboardRailSection title="Testes hoje">
        <Skeleton className="h-12 w-full" />
      </DashboardRailSection>
    );

  const used = Math.min(allowance.used, allowance.limit);
  const percent = Math.round((used / allowance.limit) * 100);
  return (
    <DashboardRailSection title="Testes hoje" aside={`${percent}%`}>
      <p className="text-xl font-semibold tracking-tight tabular-nums">
        {formatCount(allowance.used)}
        <span className="text-sm font-normal text-muted-foreground">
          {` / ${formatCount(allowance.limit)}`}
        </span>
      </p>
      <div
        role="meter"
        aria-label="Testes do Bot hoje"
        aria-valuemin={0}
        aria-valuemax={allowance.limit}
        aria-valuenow={used}
        aria-valuetext={`${formatCount(allowance.used)} de ${formatCount(allowance.limit)}`}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            "h-full rounded-full",
            used >= allowance.limit ? "bg-destructive" : "bg-brand",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        O limite renova à meia-noite no horário de São Paulo.
      </p>
    </DashboardRailSection>
  );
}
