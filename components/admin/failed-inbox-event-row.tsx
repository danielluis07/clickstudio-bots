import { ReplayInboxForm } from "@/components/admin/replay-inbox-form";
import { TableCell, TableRow } from "@/components/ui/table";
import type { WebhookInbox } from "@/modules/webhook-inbox";
import { replayInboxEventAction } from "@/server/actions/inbox";

type FailurePage = Extract<Awaited<ReturnType<WebhookInbox["listFailures"]>>, { ok: true }>;

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export function FailedInboxEventRow({ event }: { event: FailurePage["events"][number] }) {
  return (
    <TableRow>
      <TableCell className="font-mono">{event.id}</TableCell>
      <TableCell>{event.errorClass}</TableCell>
      <TableCell>
        {event.status === "pending"
          ? "Aguardando nova tentativa"
          : event.nextAutoRetryAt
            ? `Nova tentativa automática em ${dateFormat.format(event.nextAutoRetryAt)}`
            : "Tentativas esgotadas"}
      </TableCell>
      <TableCell>{dateFormat.format(event.receivedAt)}</TableCell>
      <TableCell>{event.failedAt ? dateFormat.format(event.failedAt) : "—"}</TableCell>
      <TableCell>
        <ReplayInboxForm eventId={event.id} action={replayInboxEventAction} />
      </TableCell>
    </TableRow>
  );
}
