import { LegalAcceptanceList } from "@/components/dashboard/legal-acceptance-list";
import { WhatsAppChannel } from "@/components/channels/whatsapp-channel";
import { MemberInvitations } from "@/components/dashboard/member-invitations";
import { MemberList } from "@/components/dashboard/member-list";
import { db } from "@/db";
import { createTenantRepository } from "@/modules/tenancy";
import type { TenantScope } from "@/modules/tenancy";
import { memberManagement } from "@/server/services";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export async function TenantOverview({ scope }: { scope: TenantScope }) {
  const tenant = createTenantRepository(db, scope);
  // Hiding the controls is not the authorization: the module re-checks.
  const isOwner = scope.role === "owner";
  const [profile, members, acceptances, invitations] = await Promise.all([
    tenant.getTenant(),
    tenant.listMembers(),
    tenant.listLegalAcceptances(),
    isOwner ? memberManagement.listPendingInvitations(scope) : [],
  ]);

  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-3xl font-semibold tracking-tight wrap-break-word">{profile?.name}</h1>
      <Button className="self-start" render={<Link href="/painel/conversas" />}>Abrir caixa de entrada</Button>
      <WhatsAppChannel scope={scope} />
      <MemberList members={members} canRemove={isOwner} />
      {isOwner && <MemberInvitations memberCount={members.length} invitations={invitations} />}
      <LegalAcceptanceList acceptances={acceptances} />
    </div>
  );
}
