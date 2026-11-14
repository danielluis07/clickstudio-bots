import { FormSection } from "@/components/forms/form-section";
import { OptionSelect } from "@/components/forms/option-select";
import type { BotSchedule } from "@/modules/bot";
import { scheduleOptions } from "@/modules/bot/hooks";

export function BotScheduleField({ schedule }: { schedule: BotSchedule }) {
  return (
    <FormSection title="Quando o Bot responde">
      <OptionSelect
        id="bot-schedule"
        name="schedule"
        label="Agenda"
        description="Fora do horário de funcionamento, o Bot responde; durante o horário, só a equipe. O horário de funcionamento fica no Perfil do negócio. Mudar a agenda não passa nenhuma conversa para a equipe."
        options={scheduleOptions}
        defaultValue={schedule}
      />
    </FormSection>
  );
}
