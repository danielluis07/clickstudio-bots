"use client";

import { BotRulesFields } from "@/components/bot/bot-rules-fields";
import { BotScheduleField } from "@/components/bot/bot-schedule-field";
import { BotStyleFields } from "@/components/bot/bot-style-fields";
import { FormSaveBar } from "@/components/forms/form-save-bar";
import { SubmitButton } from "@/components/forms/submit-button";
import type { BehaviourSettings, BotSettingsLimits } from "@/modules/bot";
import { useBotSettingsForm } from "@/modules/bot/hooks";
import { saveBehaviourSettingsAction } from "@/server/actions/bot-settings";

type BehaviourSettingsFormProps = {
  settings: BehaviourSettings;
  // When the settings were last saved. A save remounts the fields so they
  // show them as saved; their initial values cannot change in place.
  savedAt: Date | null;
  limits: BotSettingsLimits;
  // Other Members see the settings without being able to change them.
  canEdit: boolean;
};

export function BehaviourSettingsForm({
  settings,
  savedAt,
  limits,
  canEdit,
}: BehaviourSettingsFormProps) {
  const form = useBotSettingsForm(saveBehaviourSettingsAction);

  return (
    <form onSubmit={form.submit} className="flex flex-col">
      <fieldset
        key={savedAt?.toISOString()}
        disabled={!canEdit || form.pending}
        className="flex flex-col"
      >
        <BotStyleFields settings={settings} limits={limits} />
        <BotRulesFields settings={settings} limits={limits} />
        <BotScheduleField schedule={settings.schedule} />
      </fieldset>
      {canEdit && (
        <FormSaveBar state={form.state}>
          <SubmitButton pending={form.pending}>Salvar comportamento</SubmitButton>
        </FormSaveBar>
      )}
    </form>
  );
}
