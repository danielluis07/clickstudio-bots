import { memberRoleLabel } from "@/lib/tenant-display";

type MemberListProps = {
  members: { id: string; name: string; email: string; role: string }[];
};

export function MemberList({ members }: MemberListProps) {
  return (
    <section aria-labelledby="equipe" className="flex flex-col gap-4">
      <h2 id="equipe" className="text-xl font-semibold">Equipe</h2>
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {members.map((member) => (
          <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <span className="flex flex-col">
              <span className="font-medium">{member.name}</span>
              <span className="text-sm break-all text-muted-foreground">{member.email}</span>
            </span>
            <span className="text-sm text-muted-foreground">{memberRoleLabel(member.role)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
