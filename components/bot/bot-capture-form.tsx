"use client";

import { FormCheckboxRow } from "@/components/forms/form-checkbox-row";
import { FormSaveBar } from "@/components/forms/form-save-bar";
import { FormSection } from "@/components/forms/form-section";
import { OptionSelect } from "@/components/forms/option-select";
import { SubmitButton } from "@/components/forms/submit-button";
import type { CaptureSettings } from "@/modules/bot";
import { captureFieldOptions, captureModeOptions, useBotSettingsForm } from "@/modules/bot/hooks";
import { saveCaptureSettingsAction } from "@/server/actions/bot-settings";

type BotCaptureFormProps = {
  capture: CaptureSettings;
  // A save remounts the fields so they show the settings as saved.
  savedAt: Date | null;
  canEdit: boolean;
};

export function BotCaptureForm({ capture, savedAt, canEdit }: BotCaptureFormProps) {
  const form = useBotSettingsForm(saveCaptureSettingsAction);

  return (
    <form onSubmit={form.submit} className="flex flex-col">
      <fieldset key={savedAt?.toISOString()} disabled={!canEdit || form.pending}>
        <FormSection
          title="Captura de dados do contato"
          description="O Bot guarda no contato os dados que ele informar na conversa. A equipe vê e edita esses dados no painel do contato. Antes de chamar a equipe, o Bot pede uma única vez os dados marcados para pedir que faltarem; se o contato não informar, o Bot chama a equipe mesmo assim. Não configure a captura de dados sensíveis."
        >
          <FormCheckboxRow
            id="capture-enabled"
            name="captureEnabled"
            label="Capturar dados do contato"
            defaultChecked={capture.enabled}
          />
          {captureFieldOptions.map(({ field, label, description }) => (
            <OptionSelect
              key={field}
              id={`capture-${field}`}
              name={`capture.${field}`}
              label={label}
              description={description}
              options={captureModeOptions}
              defaultValue={capture.fields[field]}
            />
          ))}
        </FormSection>
      </fieldset>
      {canEdit && (
        <FormSaveBar state={form.state}>
          <SubmitButton pending={form.pending}>Salvar captura</SubmitButton>
        </FormSaveBar>
      )}
    </form>
  );
}
