import type { Database, Transaction } from "@/db/database";
import type { BotTurn } from "@/modules/bot/repository";
import { ReservationRaceError } from "@/modules/bot/reservation-race";
import { botTimeZone } from "@/modules/bot/schedule";
import { countContactBotReplies } from "@/modules/conversations";

// Bot replies one Contact may get per day in São Paulo time, whatever the
// Tenant's allowance has left. It keeps one Contact writing in a loop from
// spending the whole Tenant's allowance. Past it, the Conversation hands off
// as `contact_cap_reached` until a Member returns it; the next day only starts
// a fresh count.
export const dailyContactReplyLimit = 30;

const localParts = new Intl.DateTimeFormat("en-US", {
  timeZone: botTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

// The instant the São Paulo day containing `at` began. It assumes the offset
// did not change since midnight, true while Brazil keeps no daylight saving.
export const contactCapDayStart = (at: Date) => {
  const parts = Object.fromEntries(
    localParts.formatToParts(at).map(({ type, value }) => [type, Number(value)]),
  );
  const local = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const offset = local - Math.floor(at.getTime() / 1000) * 1000;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day) - offset);
};

// Whether the turn's Contact has had all of today's Bot replies.
export const contactCapReached = async (db: Database | Transaction, turn: BotTurn, now: Date) =>
  (await countContactBotReplies(db, turn.scope, turn.conversationId, contactCapDayStart(now))) >=
  dailyContactReplyLimit;

// Called in the send reservation transaction, after the lease check has locked
// the Conversation's row. The reply gate already handed off a capped Contact;
// this refuses a reservation that would pass the cap anyway, and the job's
// retry hands off.
export const reserveContactReply = async (tx: Transaction, turn: BotTurn, now: Date) => {
  if (await contactCapReached(tx, turn, now))
    throw new ReservationRaceError("Contact reply cap reached; retry the Bot turn");
};
