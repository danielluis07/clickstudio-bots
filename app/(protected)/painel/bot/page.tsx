import type { Metadata } from "next";
import { BotSettingsEditor } from "@/components/bot/bot-settings-editor";
import { requireTenantScope } from "@/server/auth/guards";

export const metadata: Metadata = {
  title: "Configurações do Bot",
  robots: { index: false },
};

export default async function BotSettingsPage() {
  const scope = await requireTenantScope();

  return <BotSettingsEditor scope={scope} />;
}
