"use client";

import { BotSandboxAllowance } from "@/components/bot/bot-sandbox-allowance";
import { BotSandboxContactDetails } from "@/components/bot/bot-sandbox-contact-details";
import { DashboardRailSection } from "@/components/dashboard/dashboard-rail-section";
import type { useBotSandbox } from "@/modules/bot/hooks";

// The Testar rail: today's tests, what the test captured and how it works.
export function BotSandboxRail({ sandbox }: { sandbox: ReturnType<typeof useBotSandbox> }) {
  return (
    <>
      <BotSandboxAllowance allowance={sandbox.allowance} />
      <BotSandboxContactDetails details={sandbox.contactDetails} />
      <DashboardRailSection title="Como funciona">
        <ul className="flex list-disc flex-col gap-1.5 pl-4 text-xs text-muted-foreground">
          <li>O teste usa as configurações e a base de conhecimento salvas.</li>
          <li>Salve suas alterações antes de enviar uma mensagem.</li>
          <li>
            Nenhuma mensagem é enviada ao WhatsApp, e os testes não consomem suas respostas do mês.
          </li>
          <li>A conversa de teste é descartada ao sair desta página.</li>
        </ul>
      </DashboardRailSection>
    </>
  );
}
