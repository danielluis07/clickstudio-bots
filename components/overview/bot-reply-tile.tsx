"use client";

import { BotReplyMeter } from "@/components/overview/bot-reply-meter";
import { StatTile } from "@/components/overview/stat-tile";
import { useBotUsage } from "@/modules/bot/hooks";

export function BotReplyTile() {
  const usage = useBotUsage();
  if (usage.data) return <BotReplyMeter usage={usage.data} />;
  return (
    <StatTile
      label="Respostas do Bot"
      value={usage.isPending ? null : "—"}
      caption={usage.isPending ? "Neste mês" : "Não foi possível consultar o uso do Bot."}
    />
  );
}
