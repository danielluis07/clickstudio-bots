import { FormCheckboxRow } from "@/components/forms/form-checkbox-row";
import { FormRow } from "@/components/forms/form-row";
import { FormSection } from "@/components/forms/form-section";
import { OptionSelect } from "@/components/forms/option-select";
import { Textarea } from "@/components/ui/textarea";
import { formatCount } from "@/lib/format";
import type { BehaviourSettings, BotSettingsLimits } from "@/modules/bot";
import { toneOptions } from "@/modules/bot/hooks";

type BotStyleFieldsProps = {
  settings: BehaviourSettings;
  limits: BotSettingsLimits;
};

export function BotStyleFields({ settings, limits }: BotStyleFieldsProps) {
  return (
    <FormSection title="Estilo das respostas">
      <OptionSelect
        id="bot-tone"
        name="tone"
        label="Tom"
        description="Como o Bot fala com os Contatos."
        options={toneOptions}
        defaultValue={settings.tone}
      />
      <FormCheckboxRow
        id="bot-emoji"
        name="emoji"
        label="Usar emojis com moderação"
        defaultChecked={settings.emoji}
      />
      <FormRow
        label="Saudação"
        htmlFor="bot-greeting"
        description={`Usada quando um Contato escreve pela primeira vez. Até ${formatCount(limits.greeting)} caracteres.`}
      >
        <Textarea
          id="bot-greeting"
          name="greeting"
          defaultValue={settings.greeting}
          maxLength={limits.greeting}
          aria-describedby="bot-greeting-description"
        />
      </FormRow>
    </FormSection>
  );
}
