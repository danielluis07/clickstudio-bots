import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BillingComingSoon } from "@/components/billing/billing-coming-soon";
import { isOwner } from "@/modules/tenancy";
import { env } from "@/platform/env";
import { requireTenantScope } from "@/server/auth/guards";

export const metadata: Metadata = {
  title: "Assinatura",
  robots: { index: false },
};

// Only owners subscribe, and only while billing is on (ADR 0012).
export default async function BillingPage() {
  const scope = await requireTenantScope();
  if (!env.BILLING_ENABLED || !isOwner(scope)) notFound();

  return <BillingComingSoon />;
}
