"use client";

import { PlusIcon } from "lucide-react";
import { BotLinkFields } from "@/components/bot/bot-link-fields";
import { Button } from "@/components/ui/button";
import type { LinkSettingsLimits } from "@/modules/bot";
import type { useBotLinkList } from "@/modules/bot/hooks";

type BotLinkListProps = {
  list: ReturnType<typeof useBotLinkList>;
  limits: LinkSettingsLimits;
  canEdit: boolean;
};

// The business's links, one row each, lined up with the form's fields.
export function BotLinkList({ list, limits, canEdit }: BotLinkListProps) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[9rem_1fr] sm:gap-4">
      <p id="bot-links-label" className="text-sm text-muted-foreground sm:pt-2">
        Links
        <span className="ml-1.5 text-xs tabular-nums">
          {list.links.length} de {limits.links}
        </span>
      </p>
      <div className="flex min-w-0 flex-col items-start gap-3">
        {list.links.length > 0 ? (
          <ul
            aria-labelledby="bot-links-label"
            className="flex w-full flex-col divide-y rounded-lg border"
          >
            {list.links.map((link) => (
              <BotLinkFields
                key={link.id}
                link={link}
                limits={limits}
                canEdit={canEdit}
                update={list.update}
                remove={list.remove}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground sm:pt-2">Nenhum link cadastrado.</p>
        )}
        {canEdit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={list.add}
            disabled={list.links.length >= limits.links}
          >
            <PlusIcon data-icon="inline-start" />
            Adicionar link
          </Button>
        )}
      </div>
    </div>
  );
}
