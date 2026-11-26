"use client";

import { CreditCardIcon } from "lucide-react";
import { DashboardNavigationItem } from "@/components/dashboard/dashboard-navigation-item";
import { useBillingStatus } from "@/modules/billing/hooks";

// "Assinatura", only for whoever may subscribe. The page itself still
// refuses everyone else.
export function BillingNavigationItem() {
  const { data } = useBillingStatus();
  if (!data?.billingPage) return null;

  return (
    <DashboardNavigationItem href="/painel/assinatura" label="Assinatura">
      <CreditCardIcon aria-hidden="true" />
    </DashboardNavigationItem>
  );
}
