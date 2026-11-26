import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

// The banner every Member of a Suspended Tenant sees. Only the owner, who
// alone can subscribe, is sent to the billing page.
export function SuspensionNotice({ suspended, isOwner }: { suspended: boolean; isOwner: boolean }) {
  if (!suspended) return null;
  return (
    <Alert variant="destructive">
      <AlertTitle>O Bot parou de responder: o período de teste terminou</AlertTitle>
      <AlertDescription>
        <p>
          As conversas, os dados e as respostas da equipe continuam funcionando.{" "}
          {isOwner
            ? "Assine o plano para o Bot voltar a responder na hora."
            : "Peça ao responsável pelo negócio para assinar o plano e o Bot voltar a responder."}
        </p>
        {isOwner && (
          <Button
            size="sm"
            className="mt-2"
            nativeButton={false}
            render={<Link href="/painel/assinatura" />}
          >
            Assinar o plano
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
