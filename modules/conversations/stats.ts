import type { BusinessHours } from "@/modules/bot";
import {
  and,
  countDistinct,
  desc,
  eq,
  gte,
  lt,
  notExists,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";
import type { Database } from "@/db/database";
import { alias } from "drizzle-orm/pg-core";
import { contact, conversation, handoffEvent, message } from "@/db/schema";
import type { ConversationHandoffReason } from "@/modules/conversations/handoff";
import type { TenantScope } from "@/modules/tenancy";
import type { Clock } from "@/platform/clock";

// The home page's periods, in São Paulo days ending today.
export const statsPeriods = [7, 30, 90] as const;

export type StatsPeriod = (typeof statsPeriods)[number];

export const defaultStatsPeriod: StatsPeriod = 30;

// One São Paulo day of Active Conversations, by whether any had a Handoff.
export type DailyConversations = {
  // "YYYY-MM-DD" in São Paulo.
  date: string;
  botOnly: number;
  withHandoff: number;
};

export type HourlyContactMessages = {
  // 0 to 23, in São Paulo.
  hour: number;
  messages: number;
};

export type RecentHandoff = {
  conversationId: string;
  contact: {
    name: string | null;
    appName: string | null;
    profileName: string | null;
    phone: string;
  };
  reason: ConversationHandoffReason;
  at: Date;
};

// What the home page shows for one period. Imported history never counts.
export type ConversationStats = {
  period: StatsPeriod;
  // Conversations with at least one Contact message in the period.
  activeConversations: number;
  // Active Conversations with no Handoff in the period.
  botOnlyConversations: number;
  // Contacts whose first Contact message arrived in the period.
  newContacts: number;
  // Every day of the period, oldest first.
  daily: DailyConversations[];
  // All 24 hours, from 0.
  contactMessagesByHour: HourlyContactMessages[];
  businessHours: BusinessHours;
  // Newest first.
  latestHandoffs: RecentHandoff[];
};

const zone = "America/Sao_Paulo";
// A literal, not a parameter, so a grouped expression matches its select.
const zoneLiteral = sql.raw(`'${zone}'`);
const dayMs = 24 * 60 * 60 * 1000;
const saoPauloDate = new Intl.DateTimeFormat("en-CA", { timeZone: zone });

// Every São Paulo day of the period, oldest first, ending with today.
const periodDays = (period: StatsPeriod, now: Date) => {
  const today = Date.parse(`${saoPauloDate.format(now)}T00:00:00Z`);
  return Array.from({ length: period }, (_, index) =>
    new Date(today - (period - 1 - index) * dayMs).toISOString().slice(0, 10),
  );
};

// "YYYY-MM-DD" of a timestamp in São Paulo.
const localDay = (column: AnyColumn) =>
  sql<string>`to_char(${column} at time zone ${zoneLiteral}, 'YYYY-MM-DD')`;

// São Paulo midnight at the start of a "YYYY-MM-DD" day.
const localMidnight = (date: string) => sql`(${date}::timestamp at time zone ${zoneLiteral})`;

// The Contact's live messages since `from`. Imported history is never activity.
const liveContactMessages = (scope: TenantScope, from: SQL) =>
  and(
    eq(message.tenantId, scope.tenantId),
    eq(message.origin, "contact"),
    eq(message.imported, false),
    gte(message.sentAt, from),
  );

// Each Active Conversation once per São Paulo day it had a Contact message.
const activeDays = (db: Database, scope: TenantScope, from: SQL) =>
  db
    .selectDistinct({
      conversationId: message.conversationId,
      day: localDay(message.sentAt).as("day"),
    })
    .from(message)
    .where(liveContactMessages(scope, from))
    .as("active_day");

// The Tenant's Handoff events since `from`.
const handoffsSince = (scope: TenantScope, from: SQL) =>
  and(eq(handoffEvent.tenantId, scope.tenantId), gte(handoffEvent.occurredAt, from));

// Each Conversation once per São Paulo day it was handed off.
const handoffDays = (db: Database, scope: TenantScope, from: SQL) =>
  db
    .selectDistinct({
      conversationId: handoffEvent.conversationId,
      day: localDay(handoffEvent.occurredAt).as("handoff_day"),
    })
    .from(handoffEvent)
    .where(handoffsSince(scope, from))
    .as("handoff_day");

// Active Conversations in the period and per day, split by Handoff: in the
// period, any Handoff in it counts; per day, only a Handoff that day.
const readActivity = async (db: Database, scope: TenantScope, from: SQL) => {
  const active = activeDays(db, scope, from);
  const handoffs = handoffDays(db, scope, from);
  const handedOffThatDay = sql`${handoffs.conversationId} is not null`;
  const handedOffInPeriod = sql`exists (select 1 from ${handoffs} where ${handoffs.conversationId} = ${active.conversationId})`;
  const [daily, [totals]] = await Promise.all([
    db
      .select({
        day: active.day,
        botOnly: sql<number>`(count(*) filter (where not ${handedOffThatDay}))::int`,
        withHandoff: sql<number>`(count(*) filter (where ${handedOffThatDay}))::int`,
      })
      .from(active)
      .leftJoin(
        handoffs,
        and(eq(handoffs.conversationId, active.conversationId), eq(handoffs.day, active.day)),
      )
      .groupBy(active.day),
    db
      .select({
        active: countDistinct(active.conversationId),
        botOnly: sql<number>`(count(distinct ${active.conversationId}) filter (where not ${handedOffInPeriod}))::int`,
      })
      .from(active),
  ]);
  return { daily, ...totals };
};

// Live Contact messages per São Paulo hour of the day.
const countMessagesByHour = (db: Database, scope: TenantScope, from: SQL) => {
  const hour = sql<number>`extract(hour from ${message.sentAt} at time zone ${zoneLiteral})::int`;
  return db
    .select({ hour, messages: sql<number>`count(*)::int` })
    .from(message)
    .where(liveContactMessages(scope, from))
    .groupBy(hour);
};

// How many Handoffs the home page lists.
const latestHandoffLimit = 5;

const readLatestHandoffs = async (
  db: Database,
  scope: TenantScope,
  from: SQL,
): Promise<RecentHandoff[]> => {
  const rows = await db
    .select({
      conversationId: handoffEvent.conversationId,
      reason: handoffEvent.reason,
      at: handoffEvent.occurredAt,
      name: contact.name,
      appName: contact.appName,
      profileName: contact.profileName,
      phone: contact.phone,
    })
    .from(handoffEvent)
    .innerJoin(conversation, eq(conversation.id, handoffEvent.conversationId))
    .innerJoin(contact, eq(contact.id, conversation.contactId))
    .where(handoffsSince(scope, from))
    .orderBy(desc(handoffEvent.occurredAt), desc(handoffEvent.id))
    .limit(latestHandoffLimit);
  return rows.map(({ conversationId, reason, at, ...contact }) => ({
    conversationId,
    contact,
    reason,
    at,
  }));
};

const earlierMessage = alias(message, "earlier_message");
const earlierConversation = alias(conversation, "earlier_conversation");

// Contacts who wrote live in the period and never before it, on any Channel.
// Imported history before the period means the Contact is not new, and
// imported history alone never makes one.
const countNewContacts = async (db: Database, scope: TenantScope, from: SQL) => {
  const [found] = await db
    .select({ contacts: countDistinct(conversation.contactId) })
    .from(message)
    .innerJoin(conversation, eq(conversation.id, message.conversationId))
    .where(
      and(
        liveContactMessages(scope, from),
        notExists(
          db
            .select({ found: sql`1` })
            .from(earlierConversation)
            .innerJoin(earlierMessage, eq(earlierMessage.conversationId, earlierConversation.id))
            .where(
              and(
                eq(earlierConversation.tenantId, scope.tenantId),
                eq(earlierConversation.contactId, conversation.contactId),
                eq(earlierMessage.origin, "contact"),
                lt(earlierMessage.sentAt, from),
              ),
            ),
        ),
      ),
    );
  return found.contacts;
};

export type ConversationStatsDependencies = {
  db: Database;
  clock: Clock;
  // The Tenant's Business hours, for shading the hour chart. They live in the
  // Bot's settings, and `modules/bot` imports this module, so the caller wires
  // the read rather than a circular import.
  readBusinessHours: (scope: TenantScope) => Promise<BusinessHours>;
};

// The home page's stats for the Tenant in scope.
export const createConversationStats = ({
  db,
  clock,
  readBusinessHours,
}: ConversationStatsDependencies) => ({
  read: async (scope: TenantScope, period: StatsPeriod): Promise<ConversationStats> => {
    const days = periodDays(period, clock.now());
    const from = localMidnight(days[0]);
    const [activity, newContacts, hourly, latestHandoffs, businessHours] = await Promise.all([
      readActivity(db, scope, from),
      countNewContacts(db, scope, from),
      countMessagesByHour(db, scope, from),
      readLatestHandoffs(db, scope, from),
      readBusinessHours(scope),
    ]);
    const byHour = new Map(hourly.map((row) => [row.hour, row.messages]));
    const byDay = new Map(activity.daily.map(({ day, ...counts }) => [day, counts]));
    return {
      period,
      activeConversations: activity.active,
      botOnlyConversations: activity.botOnly,
      newContacts,
      daily: days.map((date) => ({ date, botOnly: 0, withHandoff: 0, ...byDay.get(date) })),
      contactMessagesByHour: Array.from({ length: 24 }, (_, hour) => ({
        hour,
        messages: byHour.get(hour) ?? 0,
      })),
      businessHours,
      latestHandoffs,
    };
  },
});

export type ConversationStatsReader = ReturnType<typeof createConversationStats>;
