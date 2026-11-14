import { BusinessHoursDay } from "@/components/bot/business-hours-day";
import { FormSection } from "@/components/forms/form-section";
import type { OpeningHours, Weekday } from "@/modules/bot";
import { weekdayOptions, type BusinessProfileDraft } from "@/modules/bot/hooks";

type BusinessHoursFieldsProps = {
  hours: BusinessProfileDraft["hours"];
  onDay: (day: Weekday, change: Partial<OpeningHours & { open: boolean }>) => void;
};

export function BusinessHoursFields({ hours, onDay }: BusinessHoursFieldsProps) {
  return (
    <FormSection
      title="Horário de funcionamento"
      description="Horário de Brasília. Cada dia tem um horário, que abre e fecha no mesmo dia. O Bot informa esse horário aos Contatos."
    >
      <table className="w-full max-w-lg text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="pb-2 font-normal">
              Dia
            </th>
            <th scope="col" className="pb-2 font-normal">
              Abre
            </th>
            <th scope="col" className="pb-2 font-normal">
              Fecha
            </th>
          </tr>
        </thead>
        <tbody>
          {weekdayOptions.map(({ day, label }) => (
            <BusinessHoursDay
              key={day}
              day={day}
              label={label}
              hours={hours[day]}
              onChange={(change) => onDay(day, change)}
            />
          ))}
        </tbody>
      </table>
    </FormSection>
  );
}
