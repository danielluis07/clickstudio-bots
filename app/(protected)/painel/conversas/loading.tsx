import { ContentSkeleton } from "@/components/app-shell/content-skeleton";

// The Suspense boundary for navigations into this page and for those that keep
// this segment mounted, like /painel/conversas?conversa=… to /painel/conversas.
export default function ConversationsLoading() {
  return <ContentSkeleton />;
}
