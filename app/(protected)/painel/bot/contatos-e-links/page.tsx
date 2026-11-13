import type { Metadata } from "next";
import { BotCaptureAndLinksEditor } from "@/components/bot/bot-capture-and-links-editor";
import { requireTenantScope } from "@/server/auth/guards";

export const metadata: Metadata = {
  title: "Contatos e links",
  robots: { index: false },
};

export default async function BotCaptureAndLinksPage() {
  const scope = await requireTenantScope();

  return <BotCaptureAndLinksEditor scope={scope} />;
}
