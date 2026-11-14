import type { ReactNode } from "react";
import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { KnowledgeBaseAllowance } from "@/components/knowledge-base/knowledge-base-allowance";

// The Base de conhecimento page around its entries, with the allowance in the
// rail. The owner's editor passes the usage it keeps up to date while saving.
export function KnowledgeBasePage({
  used,
  cap,
  children,
}: {
  used: number;
  cap: number;
  children: ReactNode;
}) {
  return (
    <DashboardPage
      title="Base de conhecimento"
      width="form"
      description={
        <p>
          O Bot responde aos Contatos somente com o que estiver aqui. As alterações salvas valem a
          partir da próxima resposta, inclusive nas conversas em andamento.
        </p>
      }
      rail={<KnowledgeBaseAllowance used={used} cap={cap} />}
      railLabel="Espaço da base"
    >
      {children}
    </DashboardPage>
  );
}
