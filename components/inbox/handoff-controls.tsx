"use client";

import { Button } from "@/components/ui/button";
import { useHandoffControls } from "@/modules/conversations/hooks";
import type { RouterOutput } from "@/trpc/routers/_app";

type Conversation = RouterOutput["conversations"]["get"];

export function HandoffControls({ conversation }: { conversation: Conversation }) {
  const { takeOver, returnToBot, resolve, pending, failed } = useHandoffControls(conversation.id);

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        {conversation.owner === "bot" ? (
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={takeOver}>
            Assumir
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={returnToBot}
          >
            Devolver ao Bot
          </Button>
        )}
        {(conversation.waiting || conversation.owner === "team") && (
          <Button type="button" size="sm" disabled={pending} onClick={resolve}>
            Resolvida
          </Button>
        )}
      </div>
      {failed && (
        <p role="alert" className="text-xs text-destructive">
          Não foi possível atualizar a conversa. Tente novamente.
        </p>
      )}
    </div>
  );
}
