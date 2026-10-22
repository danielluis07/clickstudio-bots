"use client";

import { BotLinkFields } from "@/components/bot/bot-link-fields";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import type { LinkSettings, LinkSettingsLimits } from "@/modules/bot";
import { useBotLinkList, useBotSettingsForm } from "@/modules/bot/hooks";
import { saveLinkSettingsAction } from "@/server/actions/bot-settings";

type BotLinksFormProps = { settings: LinkSettings; limits: LinkSettingsLimits; canEdit: boolean };

// The parent keys this form by its save time to reset the local list after a save.
export function BotLinksForm({ settings, limits, canEdit }: BotLinksFormProps) {
  const form = useBotSettingsForm(saveLinkSettingsAction);
  const list = useBotLinkList(settings.links);
  return (
    <form onSubmit={form.submit}>
      <FieldSet disabled={!canEdit || form.pending}>
        <FieldLegend>Links do negócio</FieldLegend>
        <FieldDescription>
          Cadastre até {limits.links} links de agendamento, catálogo, pagamento ou redes sociais. O
          Bot envia o link quando fizer sentido, sem confirmar agendamento ou pagamento. Ao
          desativar, a lista fica salva. Confira as alterações salvas em Testar Bot.
        </FieldDescription>
        <FieldGroup>
          <Field orientation="horizontal">
            <Checkbox id="links-enabled" name="linksEnabled" defaultChecked={settings.enabled} />
            <FieldLabel htmlFor="links-enabled">Permitir que o Bot envie links</FieldLabel>
          </Field>
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
          {canEdit ? (
            <div className="flex flex-col gap-3">
              <div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={list.add}
                  disabled={list.links.length >= limits.links}
                >
                  Adicionar link
                </Button>
              </div>
              <FormMessage state={form.state} />
              <div>
                <SubmitButton pending={form.pending}>Salvar links</SubmitButton>
              </div>
            </div>
          ) : null}
        </FieldGroup>
      </FieldSet>
    </form>
  );
}
