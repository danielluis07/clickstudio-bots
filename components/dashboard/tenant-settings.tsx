import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { WhatsAppChannel } from "@/components/channels/whatsapp-channel";
import { LegalAcceptanceList } from "@/components/dashboard/legal-acceptance-list";
import { MemberInvitations } from "@/components/dashboard/member-invitations";
import { MemberList } from "@/components/dashboard/member-list";
import { SettingsSection } from "@/components/dashboard/settings-section";
import { db } from "@/db";
import { createTenantRepository } from "@/modules/tenancy";
import type { TenantScope } from "@/modules/tenancy";
import { memberManagement } from "@/server/services";

export async function TenantSettings({ scope }: { scope: TenantScope }) {
  const tenant = createTenantRepository(db, scope);
  // Hiding the controls is not the authorization: the module re-checks.
  const isOwner = scope.role === "owner";
  const [members, acceptances, invitations] = await Promise.all([
    tenant.listMembers(),
    tenant.listLegalAcceptances(),
    isOwner ? memberManagement.listPendingInvitations(scope) : [],
  ]);

  return (
    <DashboardPage title="Configurações" width="form">
      <SettingsSection id="canal" title="Canal">
        <WhatsAppChannel scope={scope} />
      </SettingsSection>
      <SettingsSection id="equipe" title="Equipe">
        <MemberList members={members} canRemove={isOwner} />
        {isOwner && <MemberInvitations memberCount={members.length} invitations={invitations} />}
      </SettingsSection>
      <SettingsSection
        id="termos-aceitos"
        title="Termos aceitos"
        description="Aceites dos Termos de Uso e do DPA."
      >
        <LegalAcceptanceList acceptances={acceptances} />
      </SettingsSection>
    </DashboardPage>
  );
}
