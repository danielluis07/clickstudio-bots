"use client";

import { BotUsageAlert } from "@/components/bot/bot-usage-alert";
import { useBotUsage } from "@/modules/bot/hooks";

export function BotReplyWarning() {
  const { data } = useBotUsage();
  return data ? <BotUsageAlert usage={data} /> : null;
}
