import { AlertListItem, type AlertEntry } from "@/components/alerts/alert-list-item";
import { Skeleton } from "@/components/ui/skeleton";

export function AlertList({
  alerts,
  onOpen,
}: {
  alerts: AlertEntry[] | undefined;
  onOpen: () => void;
}) {
  if (!alerts)
    return <Skeleton className="m-3 h-16" aria-busy="true" aria-label="Carregando alertas" />;
  if (alerts.length === 0)
    return <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhum alerta.</p>;
  const now = new Date();
  return (
    <ul className="max-h-[min(28rem,70dvh)] overflow-y-auto py-1">
      {alerts.map((alert) => (
        <li key={alert.id}>
          <AlertListItem alert={alert} now={now} onOpen={onOpen} />
        </li>
      ))}
    </ul>
  );
}
