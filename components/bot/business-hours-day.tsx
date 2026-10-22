import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { OpeningHours, Weekday } from "@/modules/bot";

type BusinessHoursDayProps = {
  day: Weekday;
  label: string;
  hours: OpeningHours | null;
};

// Times are kept when the day is unchecked, but only an open day's are saved.
export function BusinessHoursDay({ day, label, hours }: BusinessHoursDayProps) {
  const id = `bot-hours-${day}`;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Field orientation="horizontal" className="w-40">
        <Checkbox id={id} name={`${day}.open`} defaultChecked={hours !== null} />
        <FieldLabel htmlFor={id} className="font-normal">
          {label}
        </FieldLabel>
      </Field>
      <div className="flex items-center gap-2 text-sm">
        <Input
          type="time"
          name={`${day}.opens`}
          defaultValue={hours?.opens ?? "09:00"}
          aria-label={`${label}: abre às`}
          className="w-32"
        />
        <span aria-hidden="true">às</span>
        <Input
          type="time"
          name={`${day}.closes`}
          defaultValue={hours?.closes ?? "18:00"}
          aria-label={`${label}: fecha às`}
          className="w-32"
        />
      </div>
    </div>
  );
}
