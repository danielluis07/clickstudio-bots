import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function InboxError({ retry }: { retry: () => void }) {
  return (
    <div className="p-4">
      <Alert variant="destructive">
        <AlertTitle>Não foi possível carregar as informações.</AlertTitle>
        <AlertDescription>Confira sua conexão e tente novamente. Se a sessão expirou, entre novamente.</AlertDescription>
      </Alert>
      <Button variant="outline" className="mt-4" onClick={retry}>Tentar novamente</Button>
    </div>
  );
}
