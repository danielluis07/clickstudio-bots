import { LegalAcceptanceList } from "@/components/dashboard/legal-acceptance-list";
import { MemberList } from "@/components/dashboard/member-list";
import { db } from "@/db";
import { createTenantRepository } from "@/db/repositories/tenant";
import { requireTenantScope } from "@/lib/auth-guards";

export async function TenantOverview() {
  const tenant = createTenantRepository(db, await requireTenantScope());
  const [profile, members, acceptances] = await Promise.all([
    tenant.getTenant(),
    tenant.listMembers(),
    tenant.listLegalAcceptances(),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-3xl font-semibold tracking-tight wrap-break-word">{profile?.name}</h1>
      <MemberList members={members} />
      <LegalAcceptanceList acceptances={acceptances} />
    </div>
  );
}
