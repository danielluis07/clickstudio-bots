import { BehaviourSettingsForm } from "@/components/bot/behaviour-settings-form";
import { BotPageDescription } from "@/components/bot/bot-page-description";
import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { botSettingsLimits } from "@/modules/bot";
import type { TenantScope } from "@/modules/tenancy";
import { botSettingsEditor } from "@/server/services";

export async function BehaviourSettingsEditor({ scope }: { scope: TenantScope }) {
  const { settings, behaviour } = await botSettingsEditor.getSettings(scope);
  // Disabling the form is not the authorization: the module re-checks.
  const canEdit = scope.role === "owner";

  return (
    <DashboardPage
      title="Comportamento"
      width="form"
      description={
        <BotPageDescription saved={behaviour} canEdit={canEdit}>
          Como o Bot fala, o que evita, quando chama a equipe e quando responde.
        </BotPageDescription>
      }
    >
      <BehaviourSettingsForm
        settings={settings}
        savedAt={behaviour.updatedAt}
        limits={botSettingsLimits}
        canEdit={canEdit}
      />
    </DashboardPage>
  );
}
