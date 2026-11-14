import { DashboardRailPageSkeleton } from "@/components/dashboard/dashboard-rail-page-skeleton";

// Covers client navigations between Bot sub-pages: bot/loading.tsx sits
// above the shared bot segment, so it cannot catch this page's session read.
export default function BotSubPageLoading() {
  return <DashboardRailPageSkeleton />;
}
