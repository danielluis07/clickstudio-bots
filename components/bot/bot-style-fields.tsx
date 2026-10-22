import { OptionSelect } from "@/components/forms/option-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
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
    <FieldSet>
      <FieldLegend>Estilo das respostas</FieldLegend>
      <OptionSelect
        id="bot-tone"
        name="tone"
        label="Tom"
        description="Como o Bot fala com os Contatos."
        options={toneOptions}
        defaultValue={settings.tone}
      />
      <Field orientation="horizontal">
        <Checkbox id="bot-emoji" name="emoji" defaultChecked={settings.emoji} />
        <FieldLabel htmlFor="bot-emoji" className="font-normal">
          Usar emojis com moderação
        </FieldLabel>
      </Field>
      <Field>
        <FieldLabel htmlFor="bot-greeting">Saudação</FieldLabel>
        <Textarea
          id="bot-greeting"
          name="greeting"
          defaultValue={settings.greeting}
          maxLength={limits.greeting}
          aria-describedby="bot-greeting-description"
        />
        <FieldDescription id="bot-greeting-description">
          Usada quando um Contato escreve pela primeira vez. Até {formatCount(limits.greeting)}{" "}
          caracteres.
        </FieldDescription>
      </Field>
    </FieldSet>
  );
}
