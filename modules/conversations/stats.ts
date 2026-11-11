import type { BusinessHours } from "@/modules/bot";
import type { ConversationHandoffReason } from "@/modules/conversations/handoff";

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
