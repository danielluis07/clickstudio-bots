"use client";

import { FormMessage } from "@/components/forms/form-message";
import { OptionSelect } from "@/components/forms/option-select";
import { SubmitButton } from "@/components/forms/submit-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
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
    <form onSubmit={form.submit}>
      <FieldSet key={savedAt?.toISOString()} disabled={!canEdit || form.pending}>
        <FieldLegend>Captura de dados do contato</FieldLegend>
        <FieldDescription>
          O Bot guarda no contato os dados que ele informar na conversa. A equipe vê e edita esses
          dados no painel do contato. Antes de chamar a equipe, o Bot pede uma única vez os dados
          marcados para pedir que faltarem; se o contato não informar, o Bot chama a equipe mesmo
          assim. Não configure a captura de dados sensíveis.
        </FieldDescription>
        <Field orientation="horizontal">
          <Checkbox id="capture-enabled" name="captureEnabled" defaultChecked={capture.enabled} />
          <FieldLabel htmlFor="capture-enabled" className="font-normal">
            Capturar dados do contato
          </FieldLabel>
        </Field>
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
        {canEdit && (
          <div className="flex flex-col gap-3">
            <FormMessage state={form.state} />
            <div>
              <SubmitButton pending={form.pending}>Salvar captura</SubmitButton>
            </div>
          </div>
        )}
      </FieldSet>
    </form>
  );
}
