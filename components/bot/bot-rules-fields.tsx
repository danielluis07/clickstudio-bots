import { FormRow } from "@/components/forms/form-row";
import { FormSection } from "@/components/forms/form-section";
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
    <FormSection title="Regras">
      <FormRow
        label="Regras do negócio"
        htmlFor="bot-rules"
        description={`Orientações que o Bot deve seguir, como “Não confirme agendamentos”. Até ${formatCount(limits.rules)} caracteres.`}
      >
        <Textarea
          id="bot-rules"
          name="rules"
          defaultValue={settings.rules}
          maxLength={limits.rules}
          aria-describedby="bot-rules-description"
          className="min-h-32"
        />
      </FormRow>
      <FormRow
        label="Temas recusados"
        htmlFor="bot-refused-topics"
        description={`O Bot recusa esses temas com educação, sem chamar a equipe. ${topicHint}`}
      >
        <Textarea
          id="bot-refused-topics"
          name="refusedTopics"
          defaultValue={settings.refusedTopics.join("\n")}
          aria-describedby="bot-refused-topics-description"
        />
      </FormRow>
      <FormRow
        label="Temas para a equipe"
        htmlFor="bot-handoff-topics"
        description={`Quando um Contato fala desses temas, o Bot passa a conversa para a equipe. ${topicHint}`}
      >
        <Textarea
          id="bot-handoff-topics"
          name="handoffTopics"
          defaultValue={settings.handoffTopics.join("\n")}
          aria-describedby="bot-handoff-topics-description"
        />
      </FormRow>
    </FormSection>
  );
}
