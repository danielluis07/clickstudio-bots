import { BotCaptureForm } from "@/components/bot/bot-capture-form";
import { BotLinksForm } from "@/components/bot/bot-links-form";
import { BotPageDescription } from "@/components/bot/bot-page-description";
import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { linkSettingsLimits } from "@/modules/bot";
import type { TenantScope } from "@/modules/tenancy";
import { captureSettingsEditor, linkSettingsEditor } from "@/server/services";

export async function BotCaptureAndLinksEditor({ scope }: { scope: TenantScope }) {
  const [capture, links] = await Promise.all([
    captureSettingsEditor.getCapture(scope),
    linkSettingsEditor.getLinks(scope),
  ]);
  // Disabling the forms is not the authorization: the module re-checks.
  const canEdit = scope.role === "owner";

  return (
    <DashboardPage
      title="Contatos e links"
      width="form"
      description={
        <BotPageDescription canEdit={canEdit}>
          Os dados que o Bot guarda dos contatos e os links que ele pode enviar.
        </BotPageDescription>
      }
    >
      <BotCaptureForm capture={capture.settings} savedAt={capture.updatedAt} canEdit={canEdit} />
      <BotLinksForm
        key={links.updatedAt?.toISOString() ?? "unsaved-links"}
        settings={links.settings}
        limits={linkSettingsLimits}
        canEdit={canEdit}
      />
    </DashboardPage>
  );
}
