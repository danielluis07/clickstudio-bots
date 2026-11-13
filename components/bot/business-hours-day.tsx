import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { OpeningHours, Weekday } from "@/modules/bot";

type BusinessHoursDayProps = {
  day: Weekday;
  label: string;
  hours: OpeningHours & { open: boolean };
  onChange: (change: Partial<OpeningHours & { open: boolean }>) => void;
};

// One row of the hours table. A closed day keeps its times in the draft, but
// only an open day's are submitted.
export function BusinessHoursDay({ day, label, hours, onChange }: BusinessHoursDayProps) {
  const id = `bot-hours-${day}`;

  return (
    <tr className="border-t">
      <td className="py-1.5 pr-3">
        <span className="flex items-center gap-2.5">
          <Checkbox
            id={id}
            name={`${day}.open`}
            checked={hours.open}
            onCheckedChange={(open) => onChange({ open })}
          />
          <label htmlFor={id}>{label}</label>
        </span>
      </td>
      {hours.open ? (
        <>
          <td className="py-1.5 pr-2">
            <Input
              type="time"
              name={`${day}.opens`}
              value={hours.opens}
              onChange={(event) => onChange({ opens: event.target.value })}
              aria-label={`${label}: abre às`}
              className="h-8 w-28"
            />
          </td>
          <td className="py-1.5">
            <Input
              type="time"
              name={`${day}.closes`}
              value={hours.closes}
              onChange={(event) => onChange({ closes: event.target.value })}
              aria-label={`${label}: fecha às`}
              className="h-8 w-28"
            />
          </td>
        </>
      ) : (
        <td colSpan={2} className="py-1.5 text-muted-foreground">
          Fechado
        </td>
      )}
    </tr>
  );
}
