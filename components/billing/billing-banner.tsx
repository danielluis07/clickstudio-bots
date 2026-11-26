"use client";

import { SuspensionNotice } from "@/components/billing/suspension-notice";
import { useBillingStatus } from "@/modules/billing/hooks";

// The dashboard's billing banner, above every page. Nothing while loading,
// on error or with billing off.
export function BillingBanner() {
  const { data } = useBillingStatus();
  if (!data?.suspended) return null;
  return (
    <div className="px-4 pt-4 sm:px-6">
      <SuspensionNotice suspended={data.suspended} isOwner={data.isOwner} />
    </div>
  );
}
