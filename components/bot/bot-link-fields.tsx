"use client";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
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

export function BotLinkFields({ link, limits, canEdit, update, remove }: BotLinkFieldsProps) {
  const { confirm } = useConfirm();
  return (
    <FieldGroup>
      <input type="hidden" name="linkId" value={link.id} />
      <Field>
        <FieldLabel htmlFor={`link-label-${link.id}`}>Nome do link</FieldLabel>
        <Input
          id={`link-label-${link.id}`}
          name="linkLabel"
          value={link.label}
          required
          maxLength={limits.label}
          placeholder="Ex.: Agendamento"
          onChange={(event) => update(link.id, "label", event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`link-url-${link.id}`}>Endereço do link</FieldLabel>
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
      </Field>
      {canEdit ? (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
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
        </div>
      ) : null}
    </FieldGroup>
  );
}
