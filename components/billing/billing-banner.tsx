"use client";

import { SuspensionNotice } from "@/components/billing/suspension-notice";
import { TrialNotice } from "@/components/billing/trial-notice";
import { useBillingStatus } from "@/modules/billing/hooks";

// The dashboard's billing banner, above every page: the suspension, or else
// the Trial's last days. Nothing while loading, on error or with billing off.
export function BillingBanner() {
  const { data } = useBillingStatus();
  if (!data?.suspended && data?.trialDaysLeft == null) return null;
  return (
    <div className="px-4 pt-4 sm:px-6">
      {data.suspended ? (
        <SuspensionNotice suspended isOwner={data.isOwner} />
      ) : (
        <TrialNotice daysLeft={data.trialDaysLeft} isOwner={data.isOwner} />
      )}
    </div>
  );
}
