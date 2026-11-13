import { OptionSelect } from "@/components/forms/option-select";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import type { BotSchedule } from "@/modules/bot";
import { scheduleOptions } from "@/modules/bot/hooks";

export function BotScheduleField({ schedule }: { schedule: BotSchedule }) {
  return (
    <FieldSet>
      <FieldLegend>Quando o Bot responde</FieldLegend>
      <OptionSelect
        id="bot-schedule"
        name="schedule"
        label="Agenda"
        description="Fora do horário de funcionamento, o Bot responde; durante o horário, só a equipe. O horário de funcionamento fica no Perfil do negócio. Mudar a agenda não passa nenhuma conversa para a equipe."
        options={scheduleOptions}
        defaultValue={schedule}
      />
    </FieldSet>
  );
}
