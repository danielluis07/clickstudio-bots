import { LegalAcceptanceList } from "@/components/dashboard/legal-acceptance-list";
import { BotUsage } from "@/components/bot/bot-usage";
import { WhatsAppChannel } from "@/components/channels/whatsapp-channel";
import { MemberInvitations } from "@/components/dashboard/member-invitations";
import { MemberList } from "@/components/dashboard/member-list";
import { db } from "@/db";
import { createTenantRepository } from "@/modules/tenancy";
import type { TenantScope } from "@/modules/tenancy";
import { memberManagement } from "@/server/services";

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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
      <h1 className="text-3xl font-semibold tracking-tight wrap-break-word">{profile?.name}</h1>
      {isOwner && <BotUsage />}
      <WhatsAppChannel scope={scope} />
      <MemberList members={members} canRemove={isOwner} />
      {isOwner && <MemberInvitations memberCount={members.length} invitations={invitations} />}
      <LegalAcceptanceList acceptances={acceptances} />
    </div>
  );
}
