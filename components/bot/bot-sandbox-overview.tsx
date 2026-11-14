import { BotSandbox } from "@/components/bot/bot-sandbox";
import { DashboardPage } from "@/components/dashboard/dashboard-page";
import type { TenantScope } from "@/modules/tenancy";

// The sandbox runs only for the owner; the module re-checks every message.
export function BotSandboxOverview({ scope }: { scope: TenantScope }) {
  if (scope.role !== "owner")
    return (
      <DashboardPage
        title="Testar"
        width="form"
        description={<p>Apenas o responsável pelo negócio pode testar o Bot.</p>}
      >
        {null}
      </DashboardPage>
    );

  return (
    <BotSandbox
      description={<p>Converse com o Bot como um contato faria, usando o que está salvo agora.</p>}
    />
  );
}
