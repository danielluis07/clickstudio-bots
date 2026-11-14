import { cn } from "cn";
import { DashboardRailSection } from "@/components/dashboard/dashboard-rail-section";
import { formatCount } from "@/lib/format";

// "Espaço usado": the base's characters against its cap.
export function KnowledgeBaseAllowance({ used, cap }: { used: number; cap: number }) {
  const percent = Math.min(100, Math.round((used / cap) * 100));
  return (
    <DashboardRailSection title="Espaço usado" aside={`${percent}%`}>
      <p className="text-xl font-semibold tracking-tight tabular-nums">
        {formatCount(used)}
        <span className="text-sm font-normal text-muted-foreground">{` / ${formatCount(cap)}`}</span>
      </p>
      <div
        role="meter"
        aria-label="Caracteres usados na base de conhecimento"
        aria-valuemin={0}
        aria-valuemax={cap}
        aria-valuenow={Math.min(used, cap)}
        aria-valuetext={`${formatCount(used)} de ${formatCount(cap)} caracteres`}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full", used >= cap ? "bg-destructive" : "bg-brand")}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Caracteres usados, somando títulos, perguntas, respostas e textos.
      </p>
    </DashboardRailSection>
  );
}
