import { Checkbox } from "@/components/ui/checkbox";

// A checkbox lined up with the fields of the FormRows around it, its label
// beside it. A description gets the id `${id}-description`.
export function FormCheckboxRow({
  id,
  name,
  label,
  defaultChecked,
  description,
}: {
  id: string;
  name: string;
  label: string;
  defaultChecked: boolean;
  description?: string;
}) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[9rem_1fr] sm:gap-4">
      <div className="flex min-w-0 flex-col gap-1.5 sm:col-start-2">
        <div className="flex items-center gap-2.5">
          <Checkbox
            id={id}
            name={name}
            defaultChecked={defaultChecked}
            aria-describedby={description ? `${id}-description` : undefined}
          />
          <label htmlFor={id} className="text-sm">
            {label}
          </label>
        </div>
        {description && (
          <p id={`${id}-description`} className="text-xs text-muted-foreground">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
