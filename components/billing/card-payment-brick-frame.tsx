import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

// Where `useCardPaymentBrick` renders the Card Payment Brick: a placeholder
// while it loads, and a pt-BR notice when it can't.
export function CardPaymentBrickFrame({
  containerId,
  status,
}: {
  containerId: string;
  status: "loading" | "ready" | "failed";
}) {
  return (
    <>
      {status === "loading" && <Skeleton className="h-72 w-full" />}
      {status === "failed" && (
        <Alert variant="destructive">
          <AlertDescription>
            Não foi possível carregar o formulário do cartão. Recarregue a página para tentar de
            novo.
          </AlertDescription>
        </Alert>
      )}
      <div id={containerId} />
    </>
  );
}
