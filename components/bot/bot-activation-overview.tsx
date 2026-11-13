import { BotActivation } from "@/components/bot/bot-activation";
import { DashboardPage } from "@/components/dashboard/dashboard-page";
import type { TenantScope } from "@/modules/tenancy";

export function BotActivationOverview({ scope }: { scope: TenantScope }) {
  return (
    <DashboardPage
      title="Ativação"
      width="form"
      description={
        <p>Acompanhe as etapas antes de ativar o Bot, e pause ou retome as respostas.</p>
      }
    >
      {/* Hiding the button is not the authorization: the module re-checks. */}
      <BotActivation canActivate={scope.role === "owner"} />
    </DashboardPage>
  );
}
