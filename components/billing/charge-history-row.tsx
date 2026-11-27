import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { billingChargeStatusLabel, type BillingCharge } from "@/modules/billing";
import { formatDate, formatReais } from "@/platform/format";

// Refusals stand out; an approved Charge is quiet; anything else (pending,
// refunded, …) is neutral.
const statusVariants: Record<string, "secondary" | "destructive"> = {
  approved: "secondary",
  rejected: "destructive",
  charged_back: "destructive",
};

export function ChargeHistoryRow({ charge }: { charge: BillingCharge }) {
  return (
    <TableRow>
      <TableCell>{formatDate(charge.chargedAt)}</TableCell>
      <TableCell className="tabular-nums">{formatReais(charge.amountCents)}</TableCell>
      <TableCell>
        <Badge variant={statusVariants[charge.status] ?? "outline"}>
          {billingChargeStatusLabel(charge.status)}
        </Badge>
      </TableCell>
    </TableRow>
  );
}
