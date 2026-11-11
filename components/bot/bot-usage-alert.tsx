import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatCount } from "@/lib/format";
import type { ReplyUsage } from "@/modules/bot";

// What happens near and at the monthly Bot reply limit. Nothing below it.
export function BotUsageAlert({ usage }: { usage: ReplyUsage }) {
  if (!usage.warning) return null;
  const limit = formatCount(usage.limit);
  const percent = Math.round((usage.warningThreshold / usage.limit) * 100);
  return (
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
  );
}
