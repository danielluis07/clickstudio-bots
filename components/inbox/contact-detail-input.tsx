import { useId } from "react";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ContactDetailInputProps = {
  input: {
    field: string;
    label: string;
    placeholder: string;
    type: "text" | "email";
    multiline: boolean;
    description: string | null;
    maxLength: number;
    value: string;
  };
  onChange: (value: string) => void;
};

export function ContactDetailInput({ input, onChange }: ContactDetailInputProps) {
  const id = useId();
  const props = {
    id,
    maxLength: input.maxLength,
    autoComplete: "off",
    placeholder: input.placeholder,
    value: input.value,
  };

  return (
    <Field>
      <FieldLabel htmlFor={id}>{input.label}</FieldLabel>
      {input.multiline ? (
        <Textarea rows={3} {...props} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <Input type={input.type} {...props} onChange={(event) => onChange(event.target.value)} />
      )}
      {input.description && <FieldDescription>{input.description}</FieldDescription>}
    </Field>
  );
}
