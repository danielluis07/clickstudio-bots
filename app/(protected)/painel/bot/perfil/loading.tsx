import { DashboardRailPageSkeleton } from "@/components/dashboard/dashboard-rail-page-skeleton";

// The Suspense boundary that lets page.tsx read the session at its top.
export default function BotSubPageLoading() {
  return <DashboardRailPageSkeleton />;
}
