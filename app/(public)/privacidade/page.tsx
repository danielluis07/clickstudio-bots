import type { Metadata } from "next";
import { PrivacyPolicy } from "@/components/public-site/privacy-policy";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Dados tratados, retenção, transferências internacionais e direitos dos titulares no ClickStudio Bots.",
};

export default function PrivacyPage() {
  return <PrivacyPolicy />;
}
