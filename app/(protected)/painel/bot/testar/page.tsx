import type { Metadata } from "next";
import { BotSandboxOverview } from "@/components/bot/bot-sandbox-overview";
import { requireTenantScope } from "@/server/auth/guards";

export const metadata: Metadata = {
  title: "Testar Bot",
  robots: { index: false },
};

export default async function BotSandboxPage() {
  const scope = await requireTenantScope();

  return <BotSandboxOverview scope={scope} />;
}
