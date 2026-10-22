"use client";

import { BotRulesFields } from "@/components/bot/bot-rules-fields";
import { BotScheduleField } from "@/components/bot/bot-schedule-field";
import { BotStyleFields } from "@/components/bot/bot-style-fields";
import { BusinessHoursFields } from "@/components/bot/business-hours-fields";
import { BusinessProfileFields } from "@/components/bot/business-profile-fields";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import type { BehaviourSettings, BotSettingsLimits } from "@/modules/bot";
import { useBotSettingsForm } from "@/modules/bot/hooks";
import { saveBotSettingsAction } from "@/server/actions/bot-settings";

type BotSettingsFormProps = {
  settings: BehaviourSettings;
  // When the settings were last saved. A save remounts the fields so they
  // show the settings as saved; their initial values cannot change in place.
  savedAt: Date | null;
  limits: BotSettingsLimits;
  // Other Members see the settings without being able to change them.
  canEdit: boolean;
};

export function BotSettingsForm({ settings, savedAt, limits, canEdit }: BotSettingsFormProps) {
  const form = useBotSettingsForm(saveBotSettingsAction);

  return (
    <form onSubmit={form.submit}>
      <fieldset
        key={savedAt?.toISOString()}
        disabled={!canEdit || form.pending}
        className="flex flex-col gap-10"
      >
        <BusinessProfileFields settings={settings} limits={limits} />
        <BusinessHoursFields hours={settings.hours} />
        <BotStyleFields settings={settings} limits={limits} />
        <BotRulesFields settings={settings} limits={limits} />
        <BotScheduleField schedule={settings.schedule} />
        {canEdit && (
          <div className="flex flex-col gap-3">
            <FormMessage state={form.state} />
            <div>
              <SubmitButton pending={form.pending}>Salvar configurações</SubmitButton>
            </div>
          </div>
        )}
      </fieldset>
    </form>
  );
}
