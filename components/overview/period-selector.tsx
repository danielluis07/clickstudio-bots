import { Button } from "@/components/ui/button";
import type { StatsPeriod } from "@/modules/conversations";
import { statsPeriodOptions } from "@/modules/conversations/hooks";

export function PeriodSelector({
  period,
  onPeriod,
}: {
  period: StatsPeriod;
  onPeriod: (value: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Período"
      className="inline-flex shrink-0 gap-0.5 rounded-lg border bg-card p-0.5"
    >
      {statsPeriodOptions.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="sm"
          variant={period === option.period ? "secondary" : "ghost"}
          aria-pressed={period === option.period}
          className="tabular-nums"
          onClick={() => onPeriod(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
