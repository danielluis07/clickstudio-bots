import type { BotConfiguration } from "@/modules/bot/configuration";
import type { BotSchedule, BusinessHours } from "@/modules/bot/schedule";
import type { ChannelRoute } from "@/modules/channels";
import type { ContactDetails } from "@/modules/conversations";
import type { TenantScope } from "@/modules/tenancy";

// What the core reads about a turn's Tenant and Conversation. Adapters read
// the current saved data on every call, so edits reach the next reply.

// The Conversation a turn answers, under proof of its Tenant: a Member's
// scope ("Testar Bot") or the Channel a signed Meta event addressed (live
// turns). Adapters must still check the Conversation is that Tenant's. The
// core never takes a Tenant or Conversation id from the model.
export type BotTurn = {
  readonly scope: TenantScope | ChannelRoute;
  readonly conversationId: string;
};

export type BehaviourSettings = {
  businessName: string;
  offer: string;
  hours: BusinessHours;
  address: string;
  tone: "formal" | "neutral" | "casual";
  emoji: boolean;
  greeting: string;
  // Free-text rules the Tenant wrote for the Bot.
  rules: string;
  // Topics the Bot declines without a Handoff.
  refusedTopics: string[];
  // Topics the Bot always passes to the team.
  handoffTopics: string[];
  // Not part of the prompt: it decides only whether the Bot may reply.
  schedule: BotSchedule;
};

export type KnowledgeBase = {
  faqs: { question: string; answer: string }[];
  sections: { title: string; body: string }[];
};

// One message of the Conversation, without any Contact identifiers.
export type ContextMessage = {
  author: "contact" | "bot" | "member";
  text: string;
  sentAt: Date;
};

// The latest messages sent at or after `since`, at most `limit` of them.
export type ContextWindow = { since: Date; limit: number };

export interface BotRepository {
  getConfiguration(turn: BotTurn): Promise<BotConfiguration>;
  // The turn's Contact, never another: adapters resolve it from the turn's
  // Conversation under its scope.
  getContactDetails(turn: BotTurn): Promise<ContactDetails>;
  // Stores captured details on the turn's Contact, keeping the others.
  saveContactDetails(turn: BotTurn, details: Partial<ContactDetails>): Promise<void>;
  listRecentMessages(turn: BotTurn, window: ContextWindow): Promise<ContextMessage[]>;
}
