import type { Metadata } from "next";
import { TermsOfUse } from "@/components/public-site/terms-of-use";

export const metadata: Metadata = {
  title: "Termos de Uso e DPA",
  description: "Condições da assinatura, garantia e Acordo de Tratamento de Dados do ClickStudio Bots.",
};

export default function TermsPage() {
  return <TermsOfUse />;
}
