import Link from "next/link";
import { FailedInboxEventRow } from "@/components/admin/failed-inbox-event-row";
import { ReplayFailuresForm } from "@/components/admin/replay-failures-form";
import { buttonVariants } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCaption,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { replayInboxFailuresAction } from "@/server/actions/inbox";
import { inboxFailurePage } from "@/server/inbox-administration";
import { webhookInbox } from "@/server/services";

export async function FailedInboxEvents({ actorId, page }: { actorId: string; page: unknown }) {
  const pageNumber = inboxFailurePage(page);
  const failures = webhookInbox && (await webhookInbox.listFailures(actorId, pageNumber));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Eventos com falha</h1>
        <p className="text-muted-foreground">
          Eventos com falha são reprocessados automaticamente três vezes, em até cerca de oito
          horas. Depois disso, corrija a causa da falha e reprocesse o evento. Eventos concluídos
          permanecem concluídos. Os horários são de Brasília.
        </p>
      </div>
      {failures?.ok ? (
        failures.events.length > 0 ? (
          <>
            <div className="flex flex-wrap items-start gap-2">
              <ReplayFailuresForm
                eventIds={failures.events.map((event) => event.id)}
                label="Reprocessar esta página"
                action={replayInboxFailuresAction}
              />
              <ReplayFailuresForm label="Reprocessar todos" action={replayInboxFailuresAction} />
            </div>
            <Table>
              <TableCaption>Eventos com erro de processamento ou envio para a fila.</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>ID do evento</TableHead>
                  <TableHead>Classe do erro</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Recebido em</TableHead>
                  <TableHead>Última falha</TableHead>
                  <TableHead>Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failures.events.map((event) => (
                  <FailedInboxEventRow key={event.id} event={event} />
                ))}
              </TableBody>
            </Table>
          </>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Nenhum evento com falha nesta página</EmptyTitle>
              <EmptyDescription>
                Eventos com falha aparecem aqui enquanto aguardam recuperação.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Eventos indisponíveis</EmptyTitle>
            <EmptyDescription>
              Verifique seu acesso e a configuração do processamento de eventos.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      <nav aria-label="Páginas de eventos com falha" className="flex flex-wrap gap-2">
        {pageNumber > 1 && (
          <Link
            className={buttonVariants({ variant: "outline" })}
            href={`/admin/eventos?pagina=${pageNumber - 1}`}
          >
            Anterior
          </Link>
        )}
        <a
          className={buttonVariants({ variant: "outline" })}
          href={`/admin/eventos?pagina=${pageNumber}`}
        >
          Atualizar
        </a>
        {failures?.ok && failures.hasMore && (
          <Link
            className={buttonVariants({ variant: "outline" })}
            href={`/admin/eventos?pagina=${pageNumber + 1}`}
          >
            Próxima
          </Link>
        )}
      </nav>
    </div>
  );
}
