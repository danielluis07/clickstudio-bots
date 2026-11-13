import { ContentSkeleton } from "@/components/app-shell/content-skeleton";

// Covers client navigations between Bot sub-pages: bot/loading.tsx sits
// above the shared bot segment, so it cannot catch this page's session read.
export default function BotSubPageLoading() {
  return <ContentSkeleton />;
}
