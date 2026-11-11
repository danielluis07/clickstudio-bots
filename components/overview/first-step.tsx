import type { ReactNode } from "react";
import { CheckIcon } from "lucide-react";
import { cn } from "cn";

// One row of "Primeiros passos": its state, its name and what to do next.
export function FirstStep({
  label,
  done,
  children,
}: {
  label: string;
  done: boolean;
  children?: ReactNode;
}) {
  return (
    <li className="flex min-h-10 items-center gap-3 py-1.5 text-sm">
      <span
        aria-hidden="true"
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border",
          done && "border-brand bg-brand text-brand-foreground",
        )}
      >
        {done && <CheckIcon className="size-3" strokeWidth={3} />}
      </span>
      <span className={cn("min-w-0 flex-1", done && "text-muted-foreground line-through")}>
        {label}
        <span className="sr-only">{done ? ": concluído" : ": pendente"}</span>
      </span>
      {!done && children}
    </li>
  );
}
