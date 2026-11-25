"use client";

import { useState } from "react";
import { HistoryNotImportedNotice } from "@/components/channels/history-not-imported-notice";
import { ConversationFilter } from "@/components/inbox/conversation-filter";
import { ConversationList } from "@/components/inbox/conversation-list";
import { ConversationSearch } from "@/components/inbox/conversation-search";
import { ConversationView } from "@/components/inbox/conversation-view";
import { InboxNotice } from "@/components/inbox/inbox-notice";
import { useSearchParam } from "@/hooks/use-search-param";
import { cn } from "@/lib/utils";
import { isWaitingFilter, useInboxRealtime } from "@/modules/conversations/hooks";

// Edge to edge under the dashboard header: the list, then the open thread.
// Small screens show one at a time.
export function Inbox({
  historyNotImported,
  canDeleteContacts,
}: {
  historyNotImported: boolean;
  canDeleteContacts: boolean;
}) {
  useInboxRealtime();
  const [conversationId, openConversation] = useSearchParam("conversa");
  const [search, setSearch] = useSearchParam("busca", { history: "replace" });
  const [filter, setFilter] = useSearchParam("filtro", { history: "replace" });
  // Stays as the Member left it when they switch Conversations.
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <div className="-mx-4 -my-8 flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col sm:-mx-6">
      {/* The list, and its heading, are hidden while a small screen shows a thread. */}
      {conversationId && <h1 className="sr-only lg:hidden">Conversas</h1>}
      {historyNotImported && (
        <div className="shrink-0 border-b border-border px-4 py-3">
          <HistoryNotImportedNotice />
        </div>
      )}
      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 lg:grid-cols-[21rem_minmax(0,1fr)]">
        <div
          className={cn(
            "min-h-0 min-w-0 flex-col lg:flex lg:border-r lg:border-border",
            conversationId ? "hidden" : "flex",
          )}
        >
          <div className="flex shrink-0 flex-col gap-3 px-4 pt-4 pb-2">
            <h1 className="text-lg font-semibold tracking-tight">Conversas</h1>
            <ConversationSearch search={search} onSearch={setSearch} />
            <ConversationFilter filter={filter} onFilter={setFilter} />
          </div>
          <ConversationList
            key={`${filter}:${search}`}
            search={search}
            waiting={isWaitingFilter(filter)}
            selectedId={conversationId}
            onSelect={openConversation}
          />
        </div>
        {conversationId ? (
          <ConversationView
            key={conversationId}
            conversationId={conversationId}
            canDeleteContacts={canDeleteContacts}
            onClose={() => openConversation("")}
            detailsOpen={detailsOpen}
            onToggleDetails={() => setDetailsOpen((open) => !open)}
          />
        ) : (
          <div className="hidden bg-muted/30 lg:flex">
            <InboxNotice>Selecione uma conversa para ver as mensagens.</InboxNotice>
          </div>
        )}
      </div>
    </div>
  );
}
