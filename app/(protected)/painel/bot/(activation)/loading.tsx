import { DashboardRailPageSkeleton } from "@/components/dashboard/dashboard-rail-page-skeleton";

// In a route group so it wraps only this page, not the Bot sub-pages.
export default function BotLoading() {
  return <DashboardRailPageSkeleton />;
}
