import { OverviewSkeleton } from "@/components/overview/overview-skeleton";

// Also the Suspense boundary that lets page.tsx read the session at its top.
export default function DashboardLoading() {
  return <OverviewSkeleton />;
}
