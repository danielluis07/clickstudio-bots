import { FormRow } from "@/components/forms/form-row";
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

// A settings select, laid out as a FormRow.
export function OptionSelect({
  id,
  name,
  label,
  description,
  options,
  defaultValue,
}: OptionSelectProps) {
  return (
    <FormRow label={label} htmlFor={id} description={description}>
      <Select name={name} defaultValue={defaultValue} items={options}>
        <SelectTrigger id={id} aria-describedby={`${id}-description`} className="w-full sm:w-80">
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
    </FormRow>
  );
}
