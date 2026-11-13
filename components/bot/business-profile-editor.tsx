import { BotPageDescription } from "@/components/bot/bot-page-description";
import { BusinessProfileForm } from "@/components/bot/business-profile-form";
import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { botSettingsLimits } from "@/modules/bot";
import type { TenantScope } from "@/modules/tenancy";
import { botSettingsEditor } from "@/server/services";

export async function BusinessProfileEditor({ scope }: { scope: TenantScope }) {
  const { settings, profile } = await botSettingsEditor.getSettings(scope);
  // Disabling the form is not the authorization: the module re-checks.
  const canEdit = scope.role === "owner";

  return (
    <DashboardPage
      title="Perfil do negócio"
      width="form"
      description={
        <BotPageDescription saved={profile} canEdit={canEdit}>
          O que o Bot sabe sobre o negócio: nome, oferta, endereço e horário de funcionamento.
        </BotPageDescription>
      }
    >
      <BusinessProfileForm
        profile={settings}
        savedAt={profile.updatedAt}
        limits={botSettingsLimits}
        canEdit={canEdit}
      />
    </DashboardPage>
  );
}
