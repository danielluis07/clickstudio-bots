import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// The banner every Member sees in the last days of the Trial. Only the owner,
// who alone can subscribe, is sent to the billing page. The call to action is
// a plain link for the same reason as in `SuspensionNotice`.
export function TrialNotice({ daysLeft, isOwner }: { daysLeft: number | null; isOwner: boolean }) {
  if (daysLeft === null) return null;
  return (
    <Alert>
      <AlertTitle>
        Seu teste termina em {daysLeft} {daysLeft === 1 ? "dia" : "dias"}
      </AlertTitle>
      <AlertDescription>
        Depois disso, o Bot para de responder até o plano ser assinado.{" "}
        {isOwner ? (
          <>
            <Link href="/painel/assinatura">Assine o plano</Link> para o Bot continuar respondendo.
          </>
        ) : (
          "Peça ao responsável pelo negócio para assinar o plano e o Bot continuar respondendo."
        )}
      </AlertDescription>
    </Alert>
  );
}
