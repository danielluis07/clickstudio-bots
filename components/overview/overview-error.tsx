import { Alert, AlertDescription } from "@/components/ui/alert";

// The stats read failed; the reply meter and the rest of the page still work.
export function OverviewError() {
  return (
    <Alert variant="destructive">
      <AlertDescription>
        Não foi possível carregar as estatísticas. Atualize a página para tentar de novo.
      </AlertDescription>
    </Alert>
  );
}
