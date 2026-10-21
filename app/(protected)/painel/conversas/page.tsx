import type { Metadata } from "next";
import { PrefetchedInbox } from "@/components/inbox/prefetched-inbox";
import { searchParamText } from "@/lib/search-params";
import { requireTenantScope } from "@/server/auth/guards";
import { channelService } from "@/server/services";

export const metadata: Metadata = {
  title: "Conversas",
  robots: { index: false },
};

export default async function ConversationsPage({ searchParams }: PageProps<"/painel/conversas">) {
  const scope = await requireTenantScope();
  const [{ busca, conversa }, channel] = await Promise.all([searchParams, channelService.getChannel(scope)]);

  return (
    <PrefetchedInbox
      search={searchParamText(busca)}
      conversationId={searchParamText(conversa)}
      historyNotImported={channel?.historyNotImported ?? false}
    />
  );
}
