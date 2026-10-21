import type { Metadata } from "next";
import { PrefetchedInbox } from "@/components/inbox/prefetched-inbox";
import { searchParamText } from "@/lib/search-params";
import { requireTenantScope } from "@/server/auth/guards";

export const metadata: Metadata = {
  title: "Conversas",
  robots: { index: false },
};

export default async function ConversationsPage({ searchParams }: PageProps<"/painel/conversas">) {
  await requireTenantScope();
  const { busca, conversa } = await searchParams;

  return <PrefetchedInbox search={searchParamText(busca)} conversationId={searchParamText(conversa)} />;
}
