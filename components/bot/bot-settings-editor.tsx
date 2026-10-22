import { BotCaptureForm } from "@/components/bot/bot-capture-form";
import { BotSettingsForm } from "@/components/bot/bot-settings-form";
import { BotSettingsSavedNote } from "@/components/bot/bot-settings-saved-note";
import { BotSandboxChat } from "@/components/bot/bot-sandbox-chat";
import { BotActivation } from "@/components/bot/bot-activation";
import { botSettingsLimits } from "@/modules/bot";
import type { TenantScope } from "@/modules/tenancy";
import { botSettingsEditor, captureSettingsEditor } from "@/server/services";

export async function BotSettingsEditor({ scope }: { scope: TenantScope }) {
  const [{ settings, updatedAt, updatedBy }, capture] = await Promise.all([
    botSettingsEditor.getSettings(scope),
    captureSettingsEditor.getCapture(scope),
  ]);
  // Disabling the form is not the authorization: the module re-checks.
  const canEdit = scope.role === "owner";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Configurações do Bot</h1>
        <p className="text-muted-foreground">
          Como o Bot se apresenta, fala e quando responde. As alterações salvas valem a partir da
          próxima resposta, inclusive nas conversas em andamento.
        </p>
        {updatedAt && <BotSettingsSavedNote updatedAt={updatedAt} updatedBy={updatedBy} />}
        {!canEdit && (
          <p className="text-sm text-muted-foreground">
            Apenas o responsável pelo negócio pode alterar estas configurações.
          </p>
        )}
      </div>
      <BotActivation canActivate={canEdit} />
      <BotSettingsForm
        settings={settings}
        savedAt={updatedAt}
        limits={botSettingsLimits}
        canEdit={canEdit}
      />
      <BotCaptureForm capture={capture.settings} savedAt={capture.updatedAt} canEdit={canEdit} />
      {canEdit ? <BotSandboxChat /> : null}
    </div>
  );
}
