import type { Metadata } from "next";
import { SubprocessorList } from "@/components/public-site/subprocessor-list";

export const metadata: Metadata = {
  title: "Subprocessadores",
  description: "Fornecedores do ClickStudio Bots, finalidades, categorias de dados e locais de tratamento.",
};

export default function SubprocessorsPage() {
  return <SubprocessorList />;
}
