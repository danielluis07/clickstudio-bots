import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BillingOverview } from "@/components/billing/billing-overview";
import { env } from "@/platform/env";
import { getCurrentSession, requireTenantScope } from "@/server/auth/guards";
import { billing } from "@/server/services";

export const metadata: Metadata = {
  title: "Assinatura",
  robots: { index: false },
};

// Only owners subscribe while billing is on; with it off, only the platform
// administrator sees the page (ADR 0012). `checkout` refuses everyone else.
export default async function BillingPage() {
  const scope = await requireTenantScope();
  const [checkout, history, session] = await Promise.all([
    billing.checkout(scope),
    billing.charges(scope),
    getCurrentSession(),
  ]);
  if (!checkout.ok || !history.ok) notFound();

  return (
    <BillingOverview
      checkout={checkout}
      charges={history.charges}
      publicKey={env.MERCADO_PAGO_PUBLIC_KEY ?? null}
      defaultEmail={session?.user.email ?? ""}
    />
  );
}
