import { BotActivation } from "@/components/bot/bot-activation";
import { BotActivationStatus } from "@/components/bot/bot-activation-status";
import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { BotReplyTile } from "@/components/overview/bot-reply-tile";
import type { TenantScope } from "@/modules/tenancy";

export function BotActivationOverview({ scope }: { scope: TenantScope }) {
  const isOwner = scope.role === "owner";

  return (
    <DashboardPage
      title="Ativação"
      width="form"
      description={
        <p>
          Prepare e teste o Bot antes de ele responder aos contatos no WhatsApp. Depois, pause ou
          retome as respostas quando precisar.
        </p>
      }
      rail={
        <>
          {/* Hiding the button is not the authorization: the module re-checks. */}
          <BotActivationStatus canActivate={isOwner} />
          {isOwner && <BotReplyTile />}
        </>
      }
      railLabel="Estado do Bot"
    >
      <BotActivation />
    </DashboardPage>
  );
}
