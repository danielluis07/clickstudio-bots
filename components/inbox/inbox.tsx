"use client";

import { ArrowLeft } from "lucide-react";
import { HistoryNotImportedNotice } from "@/components/channels/history-not-imported-notice";
import { ConversationFilter } from "@/components/inbox/conversation-filter";
import { ConversationList } from "@/components/inbox/conversation-list";
import { ConversationSearch } from "@/components/inbox/conversation-search";
import { ConversationView } from "@/components/inbox/conversation-view";
import { InboxNotice } from "@/components/inbox/inbox-notice";
import { Button } from "@/components/ui/button";
import { useSearchParam } from "@/hooks/use-search-param";
import { cn } from "@/lib/utils";
import { isWaitingFilter, useInboxRealtime } from "@/modules/conversations/hooks";

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

  return (
    <div className="-mx-4 -my-8 flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col gap-3 p-3 lg:mx-0 lg:my-0 lg:h-[calc(100dvh-7.5rem)] lg:gap-6 lg:p-0">
      <h1
        className={cn(
          "shrink-0 text-3xl font-semibold tracking-tight",
          conversationId && "sr-only lg:not-sr-only",
        )}
      >
        Conversas
      </h1>
      {historyNotImported && <HistoryNotImportedNotice />}
      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 overflow-hidden rounded-lg border border-border lg:grid-cols-[17rem_minmax(0,1fr)]">
        <div
          className={cn(
            "min-h-0 min-w-0 flex-col lg:flex lg:border-r lg:border-border",
            conversationId ? "hidden" : "flex",
          )}
        >
          <ConversationSearch search={search} onSearch={setSearch} />
          <ConversationFilter filter={filter} onFilter={setFilter} />
          <ConversationList
            search={search}
            waiting={isWaitingFilter(filter)}
            selectedId={conversationId}
            onSelect={openConversation}
          />
        </div>
        {conversationId ? (
          <div className="flex min-h-0 min-w-0 flex-col">
            <div className="shrink-0 border-b border-border p-2 lg:hidden">
              <Button type="button" variant="ghost" onClick={() => openConversation("")}>
                <ArrowLeft data-icon="inline-start" />
                Voltar às conversas
              </Button>
            </div>
            <ConversationView
              key={conversationId}
              conversationId={conversationId}
              canDeleteContacts={canDeleteContacts}
              onDeleted={() => openConversation("")}
            />
          </div>
        ) : (
          <div className="hidden lg:flex">
            <InboxNotice>Selecione uma conversa para ver as mensagens.</InboxNotice>
          </div>
        )}
      </div>
    </div>
  );
}
