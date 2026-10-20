"use client";

import { useState } from "react";
import { ConversationList } from "@/components/inbox/conversation-list";
import { ConversationDetail } from "@/components/inbox/conversation-detail";
import { InboxEmpty } from "@/components/inbox/inbox-empty";

export function SharedInbox() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <div className="grid overflow-hidden rounded-xl border bg-background lg:h-[calc(100dvh-15rem)] lg:min-h-128 lg:grid-cols-[15rem_minmax(0,1fr)_15rem]">
      <ConversationList selectedId={selectedId} onSelect={setSelectedId} />
      {selectedId ? <ConversationDetail key={selectedId} id={selectedId} onBack={() => setSelectedId(null)} /> : (
        <div className="hidden lg:col-span-2 lg:flex">
          <InboxEmpty title="Selecione uma conversa" description="Leia as mensagens e atualize os dados do Contato sem sair da caixa de entrada." />
        </div>
      )}
    </div>
  );
}
