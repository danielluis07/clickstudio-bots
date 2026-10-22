import { BusinessHoursDay } from "@/components/bot/business-hours-day";
import { FieldDescription, FieldLegend, FieldSet } from "@/components/ui/field";
import type { BusinessHours } from "@/modules/bot";
import { weekdayOptions } from "@/modules/bot/hooks";

export function BusinessHoursFields({ hours }: { hours: BusinessHours }) {
  return (
    <FieldSet>
      <FieldLegend>Horário de funcionamento</FieldLegend>
      <FieldDescription>
        Horário de Brasília. Marque os dias em que o negócio abre; cada dia tem um horário, que abre
        e fecha no mesmo dia. O Bot informa esse horário aos Contatos.
      </FieldDescription>
      <div className="flex flex-col gap-3">
        {weekdayOptions.map(({ day, label }) => (
          <BusinessHoursDay key={day} day={day} label={label} hours={hours[day]} />
        ))}
      </div>
    </FieldSet>
  );
}
