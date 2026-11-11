import { cn } from "cn";
import type { ChannelSignal } from "@/modules/channels";

const signals = {
  healthy: { color: "bg-emerald-500", label: "Canal funcionando" },
  warning: { color: "bg-amber-500", label: "Canal com alerta" },
  failing: { color: "bg-destructive", label: "Canal com problema" },
  none: { color: "bg-muted-foreground/50", label: "Canal não conectado" },
} as const;

export function ChannelSignalDot({ signal }: { signal: ChannelSignal | "none" }) {
  const { color, label } = signals[signal];
  return (
    <>
      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", color)} />
      <span className="sr-only">{label}</span>
    </>
  );
}
