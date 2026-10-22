import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { formatCount } from "@/lib/format";
import type { BehaviourSettings, BotSettingsLimits } from "@/modules/bot";

type BotRulesFieldsProps = {
  settings: BehaviourSettings;
  limits: BotSettingsLimits;
};

export function BotRulesFields({ settings, limits }: BotRulesFieldsProps) {
  const topicHint = `Um tema por linha, até ${limits.topics} temas de até ${limits.topic} caracteres.`;

  return (
    <FieldSet>
      <FieldLegend>Regras</FieldLegend>
      <Field>
        <FieldLabel htmlFor="bot-rules">Regras do negócio</FieldLabel>
        <Textarea
          id="bot-rules"
          name="rules"
          defaultValue={settings.rules}
          maxLength={limits.rules}
          aria-describedby="bot-rules-description"
          className="min-h-32"
        />
        <FieldDescription id="bot-rules-description">
          Orientações que o Bot deve seguir, como “Não confirme agendamentos”. Até{" "}
          {formatCount(limits.rules)} caracteres.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="bot-refused-topics">Temas recusados</FieldLabel>
        <Textarea
          id="bot-refused-topics"
          name="refusedTopics"
          defaultValue={settings.refusedTopics.join("\n")}
          aria-describedby="bot-refused-topics-description"
        />
        <FieldDescription id="bot-refused-topics-description">
          O Bot recusa esses temas com educação, sem chamar a equipe. {topicHint}
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="bot-handoff-topics">Temas para a equipe</FieldLabel>
        <Textarea
          id="bot-handoff-topics"
          name="handoffTopics"
          defaultValue={settings.handoffTopics.join("\n")}
          aria-describedby="bot-handoff-topics-description"
        />
        <FieldDescription id="bot-handoff-topics-description">
          Quando um Contato fala desses temas, o Bot passa a conversa para a equipe. {topicHint}
        </FieldDescription>
      </Field>
    </FieldSet>
  );
}
