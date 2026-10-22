import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type OptionSelectProps = {
  id: string;
  name: string;
  label: string;
  description: string;
  options: { value: string; label: string }[];
  defaultValue: string;
};

export function OptionSelect({
  id,
  name,
  label,
  description,
  options,
  defaultValue,
}: OptionSelectProps) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select name={name} defaultValue={defaultValue} items={options}>
        <SelectTrigger id={id} aria-describedby={`${id}-description`} className="w-full sm:w-96">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription id={`${id}-description`}>{description}</FieldDescription>
    </Field>
  );
}
