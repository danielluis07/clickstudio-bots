"use client";

import { ConversationListItem } from "@/components/inbox/conversation-list-item";
import { BulkHandoffControls } from "@/components/inbox/bulk-handoff-controls";
import { InboxNotice } from "@/components/inbox/inbox-notice";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useBulkReturnToBot, useConversationList } from "@/modules/conversations/hooks";

type ConversationListProps = {
  search: string;
  waiting: boolean;
  selectedId: string;
  onSelect: (conversationId: string) => void;
};

export function ConversationList({ search, waiting, selectedId, onSelect }: ConversationListProps) {
  const { conversations, isPending, isError, hasMore, loadMore, isLoadingMore } =
    useConversationList(search, waiting);
  const bulk = useBulkReturnToBot(conversations);

  if (isPending)
    return <Skeleton className="m-3 h-16" aria-busy="true" aria-label="Carregando conversas" />;
  if (isError)
    return (
      <InboxNotice alert>Não foi possível carregar as conversas. Atualize a página.</InboxNotice>
    );
  if (conversations.length === 0) {
    return (
      <InboxNotice>
        {search
          ? "Nenhuma conversa encontrada."
          : waiting
            ? "Nenhuma conversa aguardando a equipe."
            : "Nenhuma conversa ainda."}
      </InboxNotice>
    );
  }

  return (
    <>
      {(bulk.hasHandoffs || bulk.pending || bulk.failed || bulk.succeeded) && (
        <BulkHandoffControls
          count={bulk.selected.size}
          pending={bulk.pending}
          failed={bulk.failed}
          succeeded={bulk.succeeded}
          atLimit={bulk.atLimit}
          onReturn={bulk.returnToBot}
        />
      )}
      <ScrollArea className="min-h-0 flex-1">
        <nav aria-label="Conversas">
          <ul className="divide-y divide-border">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <ConversationListItem
                  conversation={conversation}
                  selected={conversation.id === selectedId}
                  onSelect={onSelect}
                  checked={bulk.selected.has(conversation.id)}
                  selectionDisabled={
                    bulk.pending || (bulk.atLimit && !bulk.selected.has(conversation.id))
                  }
                  onCheck={bulk.toggle}
                />
              </li>
            ))}
          </ul>
          {hasMore && (
            <div className="p-3">
              <Button
                variant="outline"
                className="w-full"
                onClick={loadMore}
                disabled={isLoadingMore}
              >
                Carregar mais
              </Button>
            </div>
          )}
        </nav>
      </ScrollArea>
    </>
  );
}
