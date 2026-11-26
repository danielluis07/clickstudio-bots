import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// The banner every Member of a Suspended Tenant sees. Only the owner, who
// alone can subscribe, is sent to the billing page. The call to action is a
// plain link, which the Alert styles: `Button` would load react-dom, and an
// earlier load of react-dom breaks the browser-event component tests that run
// later in the same `bun test` process.
export function SuspensionNotice({ suspended, isOwner }: { suspended: boolean; isOwner: boolean }) {
  if (!suspended) return null;
  return (
    <Alert variant="destructive">
      <AlertTitle>O Bot parou de responder: o período de teste terminou</AlertTitle>
      <AlertDescription>
        As conversas, os dados e as respostas da equipe continuam funcionando.{" "}
        {isOwner ? (
          <>
            <Link href="/painel/assinatura">Assine o plano</Link> para o Bot voltar a responder na
            hora.
          </>
        ) : (
          "Peça ao responsável pelo negócio para assinar o plano e o Bot voltar a responder."
        )}
      </AlertDescription>
    </Alert>
  );
}
