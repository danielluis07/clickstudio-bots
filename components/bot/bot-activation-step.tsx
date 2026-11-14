import type { ReactNode } from "react";
import { CheckIcon } from "lucide-react";
import { cn } from "cn";

// One row of the Ativação checklist: its state, its name, where it stands and
// what to do next.
export function BotActivationStep({
  label,
  done,
  status,
  children,
}: {
  label: ReactNode;
  done: boolean;
  status: ReactNode;
  // The step's next action, shown while it is pending.
  children?: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 py-3.5">
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
          done && "border-brand bg-brand text-brand-foreground",
        )}
      >
        {done && <CheckIcon className="size-2.5" strokeWidth={3} />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium">
          {label}
          <span className="sr-only">{done ? ": concluído" : ": pendente"}</span>
        </span>
        <span className="block text-sm text-muted-foreground first-letter:uppercase">{status}</span>
      </div>
      {!done && children && <div className="shrink-0 self-center">{children}</div>}
    </li>
  );
}
