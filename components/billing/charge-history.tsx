import { ChargeHistoryRow } from "@/components/billing/charge-history-row";
import {
  Table,
  TableBody,
  TableCaption,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BillingCharge } from "@/modules/billing";

// The owner's payment history: every Charge, newest first. Mercado Pago
// emails its own receipt to the payer email; there is no nota fiscal.
export function ChargeHistory({ charges }: { charges: BillingCharge[] }) {
  return (
    <section aria-labelledby="charge-history" className="flex flex-col gap-3 border-t pt-6">
      <div>
        <h2 id="charge-history" className="text-sm font-semibold">
          Histórico de pagamentos
        </h2>
        <p className="text-xs text-muted-foreground">
          Cada cobrança da assinatura, da mais recente para a mais antiga. O recibo de cada
          pagamento é enviado pelo Mercado Pago para o e-mail de cobrança.
        </p>
      </div>
      {charges.length ? (
        <div className="rounded-lg border">
          <Table>
            <TableCaption className="sr-only">Cobranças da assinatura.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {charges.map((charge) => (
                <ChargeHistoryRow key={charge.id} charge={charge} />
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhuma cobrança até agora.</p>
      )}
    </section>
  );
}
