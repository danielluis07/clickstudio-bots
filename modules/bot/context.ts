import type { ModelMessage } from "@/modules/bot/model";
import type { ContextMessage, ContextWindow } from "@/modules/bot/repository";
import type { BotTurnMessage, BotTurnSnapshot } from "@/modules/conversations";

// A caption is text context, never evidence of what an attachment contains.
const messageText = (row: BotTurnMessage) => {
  if (!row.text) return "";
  return row.type === "text"
    ? row.text
    : `[Unsupported ${row.type} attachment; caption only]\n${row.text}`;
};

// What a live Bot turn replays, ending with the Contact's unanswered messages
// as one Contact message, or null when none of them has text to answer.
export const liveTurnContext = (snapshot: BotTurnSnapshot, now: Date): ContextMessage[] | null => {
  // A burst is one Contact turn. Group every unanswered text so the core's
  // bounded historical replay cannot silently discard any current question.
  const currentText = snapshot.current
    .filter((row) => !row.revokedAt)
    .map(messageText)
    .filter(Boolean)
    .join("\n\n");
  if (!currentText) return null;
  const currentIds = new Set(snapshot.current.map(({ id }) => id));
  // A Contact may write while the previous reply is being generated. Its
  // unanswered text follows that reply logically, even if sentAt is earlier.
  const replay = snapshot.history.filter((row) => !currentIds.has(row.id) && !row.revokedAt);
  const turnAt = new Date(
    Math.max(now.getTime(), ...snapshot.history.map((row) => row.sentAt.getTime())),
  );
  return [
    ...replay.map((row): ContextMessage => ({
      author: row.origin === "contact" ? "contact" : row.origin === "bot" ? "bot" : "member",
      text: messageText(row),
      sentAt: row.sentAt,
    })),
    { author: "contact", text: currentText, sentAt: turnAt },
  ];
};

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
