"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ConfiguredLink, LinkSettingsLimits } from "@/modules/bot";
import { useConfirm } from "@/providers/confirm-provider";

type BotLinkFieldsProps = {
  link: ConfiguredLink;
  limits: LinkSettingsLimits;
  canEdit: boolean;
  update: (id: string, field: "label" | "url", value: string) => void;
  remove: (id: string) => void;
};

const fieldLabel = "text-xs text-muted-foreground";

// One row of the link list: its name, its address and the owner's remove button.
export function BotLinkFields({ link, limits, canEdit, update, remove }: BotLinkFieldsProps) {
  const { confirm } = useConfirm();
  return (
    <li className="grid gap-3 p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] sm:items-end">
      <input type="hidden" name="linkId" value={link.id} />
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={`link-label-${link.id}`} className={fieldLabel}>
          Nome do link
        </label>
        <Input
          id={`link-label-${link.id}`}
          name="linkLabel"
          value={link.label}
          required
          maxLength={limits.label}
          placeholder="Ex.: Agendamento"
          onChange={(event) => update(link.id, "label", event.target.value)}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={`link-url-${link.id}`} className={fieldLabel}>
          Endereço do link
        </label>
        <Input
          id={`link-url-${link.id}`}
          name="linkUrl"
          type="url"
          value={link.url}
          required
          maxLength={limits.url}
          placeholder="https://exemplo.com/agendar"
          onChange={(event) => update(link.id, "url", event.target.value)}
        />
      </div>
      {canEdit && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="justify-self-start"
          onClick={() =>
            confirm({
              title: "Remover link?",
              message: `O link “${link.label || "sem nome"}” será removido da lista. Salve os links para que o Bot deixe de enviá-lo.`,
              action: () => remove(link.id),
            })
          }
        >
          Remover link
        </Button>
      )}
    </li>
  );
}
