import { OverviewSkeleton } from "@/components/overview/overview-skeleton";

// The Suspense boundary that lets page.tsx read the session at its top. It sits
// in a route group so it does not also wrap the sibling routes, which would
// flash this skeleton before their own on navigation.
export default function DashboardLoading() {
  return <OverviewSkeleton />;
}
