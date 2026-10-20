import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { cancelInvitationAction } from "@/server/actions/members";

type PendingInvitationListProps = {
  invitations: { id: string; email: string; expiresAt: Date }[];
};

export function PendingInvitationList({ invitations }: PendingInvitationListProps) {
  if (invitations.length === 0) return null;

  return (
    <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
      {invitations.map((invitation) => (
        <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <span className="flex flex-col">
            <span className="font-medium break-all">{invitation.email}</span>
            <span className="text-sm text-muted-foreground">Convite pendente até {formatDateTime(invitation.expiresAt)}</span>
          </span>
          <form action={cancelInvitationAction.bind(null, invitation.id)}>
            <Button type="submit" variant="ghost" size="sm">Cancelar convite</Button>
          </form>
        </li>
      ))}
    </ul>
  );
}
