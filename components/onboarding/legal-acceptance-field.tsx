import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";

export function LegalAcceptanceField() {
  return (
    <Field orientation="horizontal">
      <Checkbox id="acceptedTerms" name="acceptedTerms" required />
      <FieldLabel htmlFor="acceptedTerms" className="block font-normal leading-relaxed">
        Li e aceito os{" "}
        <Link href="/termos" target="_blank" className="underline underline-offset-4">Termos de Uso</Link>{" "}
        e o{" "}
        <Link href="/termos#dpa" target="_blank" className="underline underline-offset-4">Acordo de Tratamento de Dados (DPA)</Link>{" "}
        em nome do negócio.
      </FieldLabel>
    </Field>
  );
}
