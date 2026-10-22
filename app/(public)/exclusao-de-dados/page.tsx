import type { Metadata } from "next";
import { DataDeletion } from "@/components/public-site/data-deletion";

export const metadata: Metadata = {
  title: "Exclusão de dados",
  description:
    "Instruções por e-mail para solicitar a exclusão de dados pessoais e de dados recebidos da Meta.",
};

export default function DeletionPage() {
  return <DataDeletion />;
}
