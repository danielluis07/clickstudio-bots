import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { ReplyUsage } from "@/modules/bot";

export function BotUsageSummary({ usage }: { usage: ReplyUsage }) {
  const limit = usage.limit.toLocaleString("pt-BR");
  const percent = Math.round((usage.warningThreshold / usage.limit) * 100);
  return (
    <section aria-label="Uso do Bot" className="flex flex-col gap-3">
      <p className="text-sm font-medium">
        {`Respostas do Bot neste mês: ${usage.used.toLocaleString("pt-BR")} / ${limit}`}
      </p>
      {usage.warning && (
        <Alert variant={usage.exhausted ? "destructive" : "default"}>
          <AlertTitle>
            {usage.exhausted
              ? "Limite mensal atingido"
              : `Seu Bot atingiu ${percent}% das respostas do mês`}
          </AlertTitle>
          <AlertDescription>
            {usage.exhausted
              ? "O Bot parou de enviar respostas. As novas mensagens passam para a equipe, sem cobrança adicional."
              : `Ao atingir ${limit} respostas, o Bot para de enviar e as novas mensagens passam para a equipe, sem cobrança adicional.`}
            {
              " O limite é renovado no início do próximo mês, no horário de São Paulo. As conversas com a equipe continuam com a equipe."
            }
          </AlertDescription>
        </Alert>
      )}
    </section>
  );
}
