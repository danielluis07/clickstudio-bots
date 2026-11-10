import { RemoveMemberButton } from "@/components/dashboard/remove-member-button";
import { memberRoleLabel, type MemberRole } from "@/modules/tenancy";

type MemberListProps = {
  members: { id: string; name: string; email: string; role: MemberRole }[];
  // Shown to the owner, who is the only one allowed to remove Members.
  canRemove: boolean;
};

export function MemberList({ members, canRemove }: MemberListProps) {
  return (
    <section aria-labelledby="equipe" className="flex flex-col gap-4">
      <h2 id="equipe" className="text-xl font-semibold">
        Equipe
      </h2>
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {members.map((member) => (
          <li
            key={member.id}
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
          >
            <span className="flex flex-col">
              <span className="font-medium">{member.name}</span>
              <span className="text-sm break-all text-muted-foreground">{member.email}</span>
            </span>
            <span className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">{memberRoleLabel(member.role)}</span>
              {canRemove && member.role !== "owner" && (
                <RemoveMemberButton memberId={member.id} memberName={member.name} />
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
