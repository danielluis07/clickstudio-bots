import type { ReactNode } from "react";
import { FieldDescription, FieldLegend, FieldSet } from "@/components/ui/field";

// One group of the Business profile form, split from the next by a rule.
export function BusinessProfileSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <FieldSet className="border-t py-6 first:border-t-0 first:pt-2">
      <FieldLegend variant="label" className="mb-0 font-semibold">
        {title}
      </FieldLegend>
      {description && <FieldDescription className="-mt-2 text-xs">{description}</FieldDescription>}
      {children}
    </FieldSet>
  );
}
