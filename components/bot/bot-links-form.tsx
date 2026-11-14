"use client";

import { BotLinkList } from "@/components/bot/bot-link-list";
import { FormCheckboxRow } from "@/components/forms/form-checkbox-row";
import { FormSaveBar } from "@/components/forms/form-save-bar";
import { FormSection } from "@/components/forms/form-section";
import { SubmitButton } from "@/components/forms/submit-button";
import type { LinkSettings, LinkSettingsLimits } from "@/modules/bot";
import { useBotLinkList, useBotSettingsForm } from "@/modules/bot/hooks";
import { saveLinkSettingsAction } from "@/server/actions/bot-settings";

type BotLinksFormProps = { settings: LinkSettings; limits: LinkSettingsLimits; canEdit: boolean };

// The parent keys this form by its save time to reset the local list after a save.
export function BotLinksForm({ settings, limits, canEdit }: BotLinksFormProps) {
  const form = useBotSettingsForm(saveLinkSettingsAction);
  const list = useBotLinkList(settings.links);
  return (
    <form onSubmit={form.submit} className="flex flex-col">
      <fieldset disabled={!canEdit || form.pending}>
        <FormSection
          title="Links do negócio"
          description={`Cadastre até ${limits.links} links de agendamento, catálogo, pagamento ou redes sociais. O Bot envia o link quando fizer sentido, sem confirmar agendamento ou pagamento. Ao desativar, a lista fica salva. Confira as alterações salvas em Testar Bot.`}
        >
          <FormCheckboxRow
            id="links-enabled"
            name="linksEnabled"
            label="Permitir que o Bot envie links"
            defaultChecked={settings.enabled}
          />
          <BotLinkList list={list} limits={limits} canEdit={canEdit} />
        </FormSection>
      </fieldset>
      {canEdit && (
        <FormSaveBar state={form.state}>
          <SubmitButton pending={form.pending}>Salvar links</SubmitButton>
        </FormSaveBar>
      )}
    </form>
  );
}
