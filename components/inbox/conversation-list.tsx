"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { useConversationList } from "@/modules/conversations/hooks";
import { InboxEmpty } from "@/components/inbox/inbox-empty";
import { InboxError } from "@/components/inbox/inbox-error";
import { InboxSkeleton } from "@/components/inbox/inbox-skeleton";

export function ConversationList({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }) {
  const query = useConversationList();
  return (
    <aside aria-label="Conversas" className={cn("flex min-h-0 flex-col border-b lg:border-r lg:border-b-0", selectedId && "hidden lg:flex")}>
      <div className="flex flex-col gap-3 border-b p-4">
        <h2 className="font-semibold">Conversas</h2>
        <label htmlFor="conversation-search" className="sr-only">Buscar por nome ou telefone</label>
        <Input id="conversation-search" type="search" placeholder="Buscar nome ou telefone" maxLength={120}
          value={query.search} onChange={(event) => query.setSearch(event.target.value)} />
        <p className="text-xs text-muted-foreground" role="status">
          {query.isFetching ? "Atualizando conversas…" : "Mais recentes primeiro"}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={query.isFetching}>
        {query.isPending ? <InboxSkeleton /> : query.isError ? <InboxError retry={() => void query.refetch()} /> : query.data.length === 0 ? (
          <InboxEmpty title={query.search ? "Nenhuma conversa encontrada" : "Sua caixa de entrada está vazia"}
            description={query.search ? "Tente outro nome ou telefone." : "As mensagens recebidas no WhatsApp conectado aparecem aqui."} />
        ) : (
          <ul className="flex flex-col">
            {query.data.map((conversation) => (
              <li key={conversation.id}>
                <button type="button" aria-current={selectedId === conversation.id ? "true" : undefined}
                  onClick={() => onSelect(conversation.id)}
                  className={cn("flex w-full flex-col gap-1 border-b px-4 py-4 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", selectedId === conversation.id && "bg-accent")}>
                  <span className="truncate font-medium">{conversation.contactName || conversation.contactPhone}</span>
                  <span className="truncate text-xs text-muted-foreground">+{conversation.contactPhone}</span>
                  <span className="line-clamp-2 text-sm text-muted-foreground">{conversation.lastMessageText ?? "Sem mensagens"}</span>
                  {conversation.lastMessageAt && <time className="text-xs text-muted-foreground" dateTime={conversation.lastMessageAt.toISOString()}>{formatDateTime(conversation.lastMessageAt)}</time>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
