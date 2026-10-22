"use client";

import { ConversationListItem } from "@/components/inbox/conversation-list-item";
import { InboxNotice } from "@/components/inbox/inbox-notice";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useConversationList } from "@/modules/conversations/hooks";

type ConversationListProps = {
  search: string;
  selectedId: string;
  onSelect: (conversationId: string) => void;
};

export function ConversationList({ search, selectedId, onSelect }: ConversationListProps) {
  const { conversations, isPending, isError, hasMore, loadMore, isLoadingMore } =
    useConversationList(search);

  if (isPending)
    return <Skeleton className="m-3 h-16" aria-busy="true" aria-label="Carregando conversas" />;
  if (isError)
    return (
      <InboxNotice alert>Não foi possível carregar as conversas. Atualize a página.</InboxNotice>
    );
  if (conversations.length === 0) {
    return (
      <InboxNotice>
        {search ? "Nenhuma conversa encontrada." : "Nenhuma conversa ainda."}
      </InboxNotice>
    );
  }

  return (
    <nav aria-label="Conversas" className="min-h-0 flex-1 overflow-y-auto">
      <ul className="divide-y divide-border">
        {conversations.map((conversation) => (
          <li key={conversation.id}>
            <ConversationListItem
              conversation={conversation}
              selected={conversation.id === selectedId}
              onSelect={onSelect}
            />
          </li>
        ))}
      </ul>
      {hasMore && (
        <div className="p-3">
          <Button variant="outline" className="w-full" onClick={loadMore} disabled={isLoadingMore}>
            Carregar mais
          </Button>
        </div>
      )}
    </nav>
  );
}
