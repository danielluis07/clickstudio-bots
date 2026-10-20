import type { Metadata } from "next";
import { Suspense } from "react";
import { ContentSkeleton } from "@/components/app-shell/content-skeleton";
import { TenantOverview } from "@/components/dashboard/tenant-overview";

export const metadata: Metadata = {
  title: "Painel",
  robots: { index: false },
};

export default function DashboardPage() {
  return (
    <Suspense fallback={<ContentSkeleton />}>
      <TenantOverview />
    </Suspense>
  );
}
