import { ExtendTrialForm } from "@/components/admin/extend-trial-form";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import type { TenantTrial } from "@/modules/billing";
import { formatLastDay } from "@/platform/format";
import { extendTrialAction } from "@/server/actions/billing";

export function TrialRow({ tenant }: { tenant: TenantTrial }) {
  return (
    <TableRow>
      <TableCell>{tenant.name}</TableCell>
      <TableCell>{tenant.trialEndsAt ? formatLastDay(tenant.trialEndsAt) : "—"}</TableCell>
      <TableCell>
        {tenant.suspended ? (
          <Badge variant="destructive">Suspenso</Badge>
        ) : (
          <Badge variant="secondary">Ativo</Badge>
        )}
      </TableCell>
      <TableCell>
        <ExtendTrialForm tenantId={tenant.id} tenantName={tenant.name} action={extendTrialAction} />
      </TableCell>
    </TableRow>
  );
}
