import { InviteMemberForm } from "@/components/dashboard/invite-member-form";
import { PendingInvitationList } from "@/components/dashboard/pending-invitation-list";
import { memberAllowance } from "@/modules/tenancy";

type MemberInvitationsProps = {
  memberCount: number;
  invitations: { id: string; email: string; expiresAt: Date }[];
};

export function MemberInvitations({ memberCount, invitations }: MemberInvitationsProps) {
  const seatsInUse = memberCount + invitations.length;

  return (
    <section aria-labelledby="convidar" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 id="convidar" className="text-xl font-semibold">
          Convidar membros
        </h2>
        <p className="text-muted-foreground">
          {seatsInUse} de {memberAllowance} vagas em uso. Convites pendentes também ocupam uma vaga
          até serem aceitos, cancelados ou expirarem.
        </p>
      </div>
      <PendingInvitationList invitations={invitations} />
      <InviteMemberForm />
    </section>
  );
}
