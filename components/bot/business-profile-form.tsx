"use client";

import type { ReactNode } from "react";
import { BusinessHoursFields } from "@/components/bot/business-hours-fields";
import { BusinessProfileFields } from "@/components/bot/business-profile-fields";
import { BusinessProfilePreview } from "@/components/bot/business-profile-preview";
import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { FormSaveBar } from "@/components/forms/form-save-bar";
import { SubmitButton } from "@/components/forms/submit-button";
import type { BotSettingsLimits, BusinessProfile } from "@/modules/bot";
import { useBotSettingsForm, useBusinessProfileDraft } from "@/modules/bot/hooks";
import { saveBusinessProfileAction } from "@/server/actions/bot-settings";

type BusinessProfileFormProps = {
  profile: BusinessProfile;
  limits: BotSettingsLimits;
  // Other Members see the profile without being able to change it.
  canEdit: boolean;
  description: ReactNode;
};

// The whole Perfil do negócio page: the fields, and beside them a preview
// that follows the owner's edits before they save.
export function BusinessProfileForm({
  profile,
  limits,
  canEdit,
  description,
}: BusinessProfileFormProps) {
  const form = useBotSettingsForm(saveBusinessProfileAction);
  const { draft, setField, setDay } = useBusinessProfileDraft(profile);

  return (
    <DashboardPage
      title="Perfil do negócio"
      width="form"
      description={description}
      rail={<BusinessProfilePreview draft={draft} />}
      railLabel="Prévia"
    >
      <form onSubmit={form.submit} className="flex flex-col">
        <fieldset disabled={!canEdit || form.pending} className="flex flex-col">
          <BusinessProfileFields draft={draft} limits={limits} onField={setField} />
          <BusinessHoursFields hours={draft.hours} onDay={setDay} />
        </fieldset>
        {canEdit && (
          <FormSaveBar state={form.state}>
            <SubmitButton pending={form.pending}>Salvar perfil</SubmitButton>
          </FormSaveBar>
        )}
      </form>
    </DashboardPage>
  );
}
