import { CreditCardIcon } from "lucide-react";
import { DashboardPage } from "@/components/dashboard/dashboard-page";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

// The billing page until owners can subscribe (#257).
export function BillingComingSoon() {
  return (
    <DashboardPage title="Assinatura" width="form">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CreditCardIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Em breve</EmptyTitle>
          <EmptyDescription>
            Em breve você poderá assinar o plano por aqui, com cartão de crédito. Enquanto isso, as
            conversas, os dados e as respostas da equipe continuam funcionando.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </DashboardPage>
  );
}
