import { formatCount } from "@/lib/format";

export function KnowledgeBaseAllowance({ used, cap }: { used: number; cap: number }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        <span className="font-medium">
          {formatCount(used)} / {formatCount(cap)}
        </span>{" "}
        <span className="text-muted-foreground">
          caracteres usados, somando títulos, perguntas, respostas e textos.
        </span>
      </p>
      <progress
        value={Math.min(used, cap)}
        max={cap}
        aria-label="Caracteres usados na base de conhecimento"
        className="h-2 w-full overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary"
      />
    </div>
  );
}
