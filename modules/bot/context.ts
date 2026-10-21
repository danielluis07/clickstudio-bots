import type { ModelMessage } from "@/modules/bot/model";
import type { ContextMessage, ContextWindow } from "@/modules/bot/repository";

// How much of the Conversation a turn replays. Both caps bound cost; the
// evaluation tunes them.
export type ContextLimits = {
  maxMessages: number;
  maxAgeDays: number;
};

export const defaultContextLimits: ContextLimits = { maxMessages: 20, maxAgeDays: 7 };

const dayMs = 24 * 60 * 60 * 1000;

// Marks a Member's reply, so the model tells it apart from its own.
export const memberLabel = "[Team member]";

export const contextWindow = (now: Date, limits: ContextLimits): ContextWindow => ({
  since: new Date(now.getTime() - limits.maxAgeDays * dayMs),
  limit: limits.maxMessages,
});

// Only author and text cross to the model: never phone numbers or other
// Contact identifiers, whatever else an adapter returned.
const toModelMessage = ({ author, text }: ContextMessage): ModelMessage =>
  author === "contact"
    ? { role: "user", text }
    : { role: "assistant", text: author === "member" ? `${memberLabel} ${text}` : text };

// The capped replay, from its first Contact message on, or null when no
// Contact message awaits an answer. The caps apply here too, so an adapter
// that returns more cannot widen them.
export const replayContext = (messages: ContextMessage[], window: ContextWindow) => {
  const recent = messages
    .filter(({ sentAt }) => sentAt >= window.since)
    .toSorted((a, b) => a.sentAt.getTime() - b.sentAt.getTime())
    .slice(-window.limit);
  if (recent.at(-1)?.author !== "contact") return null;
  return recent.slice(recent.findIndex(({ author }) => author === "contact")).map(toModelMessage);
};
