"use client";

import Link from "next/link";
import { BotActivationStep } from "@/components/bot/bot-activation-step";
import { BotChannelStep } from "@/components/bot/bot-channel-step";
import { Skeleton } from "@/components/ui/skeleton";
import { useBotActivation } from "@/modules/bot/hooks";

const stepLink = "text-sm font-medium text-primary underline-offset-4 hover:underline";

// The checks the Bot must pass before it can be activated. The Bot's state
// and the activate and pause controls sit in the rail (BotActivationStatus).
export function BotActivation() {
  const bot = useBotActivation();
  const status = bot.status.data;

  if (!status)
    return bot.status.isError ? (
      <p role="status" className="text-sm text-destructive">
        Não foi possível carregar as etapas.
      </p>
    ) : (
      <div role="status" aria-label="Carregando etapas…" className="flex flex-col gap-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-56 w-full" />
      </div>
    );

  const done = [status.profile, status.knowledge, status.tested, status.connected].filter(
    Boolean,
  ).length;
  return (
    <section aria-labelledby="bot-activation-steps" className="flex flex-col">
      <div className="flex items-baseline justify-between gap-2 border-b pb-3">
        <h2 id="bot-activation-steps" className="text-sm font-semibold">
          Etapas
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">{done} de 4</span>
      </div>
      <ol className="flex flex-col divide-y border-b">
        <BotActivationStep
          label="Perfil do negócio"
          done={status.profile}
          status={status.profile ? "Salvo" : "Preencha e salve o perfil."}
        >
          <Link href="/painel/bot/perfil" className={stepLink}>
            Preencher
          </Link>
        </BotActivationStep>
        <BotActivationStep
          label="Base de conhecimento"
          done={status.knowledge}
          status={status.knowledge ? "Preenchida" : "Adicione ao menos uma informação."}
        >
          <Link href="/painel/base-de-conhecimento" className={stepLink}>
            Adicionar
          </Link>
        </BotActivationStep>
        <BotActivationStep
          label="Testar Bot"
          done={status.tested}
          status={status.tested ? "Concluído" : "Envie um teste após salvar suas alterações."}
        >
          <Link href="/painel/bot/testar" className={stepLink}>
            Testar
          </Link>
        </BotActivationStep>
        <BotActivationStep
          label="WhatsApp"
          done={status.connected}
          status={<BotChannelStep connected={status.connected} />}
        />
      </ol>
    </section>
  );
}
