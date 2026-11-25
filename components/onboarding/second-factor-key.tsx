import { buttonVariants } from "@/components/ui/button";

type SecondFactorKeyProps = {
  totpUri: string;
  setupKey: string;
};

export function SecondFactorKey({ totpUri, setupKey }: SecondFactorKeyProps) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">1. Adicione a conta no aplicativo autenticador</h2>
      <p className="text-sm text-muted-foreground">
        No Google Authenticator, Microsoft Authenticator ou outro aplicativo, escolha inserir uma
        chave de configuração e digite:
      </p>
      <code
        aria-label="Chave de configuração"
        className="rounded-lg bg-muted px-3 py-2 font-mono text-sm break-all select-all"
      >
        {setupKey}
      </code>
      <a href={totpUri} className={buttonVariants({ variant: "outline" })}>
        Abrir no aplicativo autenticador
      </a>
    </section>
  );
}
