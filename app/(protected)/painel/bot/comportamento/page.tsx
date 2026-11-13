import type { Metadata } from "next";
import { BehaviourSettingsEditor } from "@/components/bot/behaviour-settings-editor";
import { requireTenantScope } from "@/server/auth/guards";

export const metadata: Metadata = {
  title: "Comportamento do Bot",
  robots: { index: false },
};

export default async function BehaviourSettingsPage() {
  const scope = await requireTenantScope();

  return <BehaviourSettingsEditor scope={scope} />;
}
