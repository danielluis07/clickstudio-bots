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
  const selecting = bulk.selected.size > 0;

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
            ? "Nenhuma conversa em aberto."
            : "Nenhuma conversa ainda."}
      </InboxNotice>
    );
  }

  const now = new Date();
  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <nav aria-label="Conversas" className="px-2 pb-2">
          <ul className="flex flex-col gap-0.5">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <ConversationListItem
                  conversation={conversation}
                  now={now}
                  selected={conversation.id === selectedId}
                  onSelect={onSelect}
                  selecting={selecting}
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
            <div className="pt-1">
              <Button
                variant="ghost"
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
      {/* Below the list, so rows stay put when the first one is ticked. */}
      {(selecting || bulk.pending || bulk.failed || bulk.succeeded) && (
        <BulkHandoffControls
          count={bulk.selected.size}
          pending={bulk.pending}
          failed={bulk.failed}
          succeeded={bulk.succeeded}
          atLimit={bulk.atLimit}
          onReturn={bulk.returnToBot}
        />
      )}
    </>
  );
}
