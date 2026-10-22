"use client";

import { HistoryNotImportedNotice } from "@/components/channels/history-not-imported-notice";
import { ConversationList } from "@/components/inbox/conversation-list";
import { ConversationSearch } from "@/components/inbox/conversation-search";
import { ConversationView } from "@/components/inbox/conversation-view";
import { InboxNotice } from "@/components/inbox/inbox-notice";
import { useSearchParam } from "@/hooks/use-search-param";
import { useInboxRealtime } from "@/modules/conversations/hooks";

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

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">Conversas</h1>
      {historyNotImported && <HistoryNotImportedNotice />}
      <div className="grid h-[calc(100svh-14rem)] min-h-128 grid-cols-[17rem_1fr] overflow-hidden rounded-lg border border-border">
        <div className="flex min-h-0 flex-col border-r border-border">
          <ConversationSearch search={search} onSearch={setSearch} />
          <ConversationList
            search={search}
            selectedId={conversationId}
            onSelect={openConversation}
          />
        </div>
        {conversationId ? (
          <ConversationView
            key={conversationId}
            conversationId={conversationId}
            canDeleteContacts={canDeleteContacts}
            onDeleted={() => openConversation("")}
          />
        ) : (
          <InboxNotice>Selecione uma conversa para ver as mensagens.</InboxNotice>
        )}
      </div>
    </div>
  );
}
