"use client";

import type { ReactNode } from "react";
import { BotSandboxChat } from "@/components/bot/bot-sandbox-chat";
import { BotSandboxRail } from "@/components/bot/bot-sandbox-rail";
import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { useBotSandbox } from "@/modules/bot/hooks";

// The owner's whole Testar page: the test conversation, and beside it the
// day's allowance and what the test captured.
export function BotSandbox({ description }: { description: ReactNode }) {
  const sandbox = useBotSandbox();

  return (
    <DashboardPage
      title="Testar"
      width="form"
      description={description}
      rail={<BotSandboxRail sandbox={sandbox} />}
      railLabel="Sobre o teste"
    >
      <BotSandboxChat sandbox={sandbox} />
    </DashboardPage>
  );
}
