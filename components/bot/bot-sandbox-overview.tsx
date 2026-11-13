import { BotSandboxChat } from "@/components/bot/bot-sandbox-chat";
import { DashboardPage } from "@/components/dashboard/dashboard-page";
import type { TenantScope } from "@/modules/tenancy";

// The sandbox runs only for the owner; the module re-checks every message.
export function BotSandboxOverview({ scope }: { scope: TenantScope }) {
  const canTest = scope.role === "owner";

  return (
    <DashboardPage
      title="Testar"
      width="form"
      description={
        <p>
          {canTest
            ? "Converse com o Bot como um contato faria, usando o que está salvo agora."
            : "Apenas o responsável pelo negócio pode testar o Bot."}
        </p>
      }
    >
      {canTest ? <BotSandboxChat /> : null}
    </DashboardPage>
  );
}
