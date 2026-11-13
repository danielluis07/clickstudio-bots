"use client";

import { BusinessHoursFields } from "@/components/bot/business-hours-fields";
import { BusinessProfileFields } from "@/components/bot/business-profile-fields";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import type { BotSettingsLimits, BusinessProfile } from "@/modules/bot";
import { useBotSettingsForm } from "@/modules/bot/hooks";
import { saveBusinessProfileAction } from "@/server/actions/bot-settings";

type BusinessProfileFormProps = {
  profile: BusinessProfile;
  // When the profile was last saved. A save remounts the fields so they show
  // it as saved; their initial values cannot change in place.
  savedAt: Date | null;
  limits: BotSettingsLimits;
  // Other Members see the profile without being able to change it.
  canEdit: boolean;
};

export function BusinessProfileForm({
  profile,
  savedAt,
  limits,
  canEdit,
}: BusinessProfileFormProps) {
  const form = useBotSettingsForm(saveBusinessProfileAction);

  return (
    <form onSubmit={form.submit}>
      <fieldset
        key={savedAt?.toISOString()}
        disabled={!canEdit || form.pending}
        className="flex flex-col gap-10"
      >
        <BusinessProfileFields settings={profile} limits={limits} />
        <BusinessHoursFields hours={profile.hours} />
        {canEdit && (
          <div className="flex flex-col gap-3">
            <FormMessage state={form.state} />
            <div>
              <SubmitButton pending={form.pending}>Salvar perfil</SubmitButton>
            </div>
          </div>
        )}
      </fieldset>
    </form>
  );
}
