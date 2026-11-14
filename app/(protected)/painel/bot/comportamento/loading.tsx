import { DashboardFormPageSkeleton } from "@/components/dashboard/dashboard-form-page-skeleton";

// The Suspense boundary that lets page.tsx read the session at its top.
export default function BotSubPageLoading() {
  return <DashboardFormPageSkeleton />;
}
