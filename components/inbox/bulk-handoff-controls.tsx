import { Button } from "@/components/ui/button";

type BulkHandoffControlsProps = {
  count: number;
  pending: boolean;
  failed: boolean;
  succeeded: boolean;
  atLimit: boolean;
  onReturn: () => void;
};

export function BulkHandoffControls({
  count,
  pending,
  failed,
  succeeded,
  atLimit,
  onReturn,
}: BulkHandoffControlsProps) {
  return (
    <div className="flex flex-col gap-2 border-b border-border p-3">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {count === 1 ? "1 conversa selecionada" : `${count} conversas selecionadas`}
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={count === 0 || pending}
        onClick={onReturn}
      >
        {pending ? "Devolvendo ao Bot…" : "Devolver selecionadas ao Bot"}
      </Button>
      <p className="text-xs text-muted-foreground">
        O Bot responderá apenas à próxima mensagem de cada contato.
      </p>
      {atLimit && (
        <p className="text-xs text-muted-foreground">Selecione até 100 conversas por vez.</p>
      )}
      {failed && (
        <p role="alert" className="text-xs text-destructive">
          Não foi possível devolver as conversas ao Bot. Atualize a lista e tente novamente.
        </p>
      )}
      {succeeded && (
        <p role="status" className="text-xs text-muted-foreground">
          Conversas devolvidas ao Bot.
        </p>
      )}
    </div>
  );
}
