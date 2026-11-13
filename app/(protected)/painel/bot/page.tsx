import type { Metadata } from "next";
import { BotActivationOverview } from "@/components/bot/bot-activation-overview";
import { requireTenantScope } from "@/server/auth/guards";

export const metadata: Metadata = {
  title: "Ativação do Bot",
  robots: { index: false },
};

export default async function BotActivationPage() {
  const scope = await requireTenantScope();

  return <BotActivationOverview scope={scope} />;
}
