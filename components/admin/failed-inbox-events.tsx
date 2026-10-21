import Link from "next/link";
import { FailedInboxEventRow } from "@/components/admin/failed-inbox-event-row";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCaption, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { inboxFailureOffset } from "@/server/inbox-administration";
import { webhookInbox } from "@/server/services";

export async function FailedInboxEvents({ actorId, page }: { actorId: string; page: unknown }) {
  const offset = inboxFailureOffset(page);
  const failures = webhookInbox && await webhookInbox.listFailures(actorId, offset);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Eventos com falha</h1>
        <p className="text-muted-foreground">
          Corrija a causa da falha e reprocese o evento. Eventos concluídos permanecem concluídos.
          Os horários são de Brasília.
        </p>
      </div>
      {failures?.ok ? (
        failures.events.length > 0 ? (
          <Table>
            <TableCaption>Eventos com erro de processamento ou envio para a fila, até 50 por página.</TableCaption>
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
            <TableBody>{failures.events.map((event) => <FailedInboxEventRow key={event.id} event={event} />)}</TableBody>
          </Table>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Nenhum evento com falha nesta página</EmptyTitle>
              <EmptyDescription>Eventos com falha aparecem aqui enquanto aguardam recuperação.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Eventos indisponíveis</EmptyTitle>
            <EmptyDescription>Verifique seu acesso e a configuração do processamento de eventos.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      <nav aria-label="Páginas de eventos com falha" className="flex flex-wrap gap-2">
        {offset > 0 && <Button variant="outline" render={<Link href={`/admin/eventos?pagina=${offset / 50}`} />}>Anterior</Button>}
        <Button variant="outline" render={<a href={`/admin/eventos?pagina=${offset / 50 + 1}`} />}>Atualizar</Button>
        {failures?.ok && failures.hasMore && <Button variant="outline" render={<Link href={`/admin/eventos?pagina=${offset / 50 + 2}`} />}>Próxima</Button>}
      </nav>
    </div>
  );
}
