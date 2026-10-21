import { ContentSkeleton } from "@/components/app-shell/content-skeleton";

// The Suspense boundary for navigations that keep this segment mounted, like
// /painel/conversas?conversa=… to /painel/conversas, which /painel's
// loading.tsx sits above.
export default function ConversationsLoading() {
  return <ContentSkeleton />;
}
