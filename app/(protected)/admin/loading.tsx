import { ContentSkeleton } from "@/components/app-shell/content-skeleton";

// Also the Suspense boundary that lets page.tsx read the session at its top.
export default function AdminLoading() {
  return <ContentSkeleton />;
}
