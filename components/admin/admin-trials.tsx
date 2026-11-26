import { TrialRow } from "@/components/admin/trial-row";
import {
  Table,
  TableBody,
  TableCaption,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { billing } from "@/server/services";

// Nothing while billing is off in this environment: no Trial counts down.
export async function AdminTrials({ actorId }: { actorId: string }) {
  const trials = await billing.trials(actorId);
  if (!trials.ok) return null;

  return (
    <section aria-labelledby="periodos-de-teste" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 id="periodos-de-teste" className="text-xl font-semibold">
          Períodos de teste
        </h2>
        <p className="text-muted-foreground">
          Escolha o último dia do teste de um negócio. O teste vai até a meia-noite desse dia, no
          horário de Brasília. Um negócio suspenso pelo fim do teste volta ao normal na hora, e o
          Bot volta a responder. Negócios com assinatura ativa não podem ter o teste estendido.
        </p>
      </div>
      <Table>
        <TableCaption>Negócios e o fim do período de teste de cada um.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Negócio</TableHead>
            <TableHead>Último dia do teste</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead>Estender até</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trials.tenants.map((tenant) => (
            <TrialRow key={tenant.id} tenant={tenant} />
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
