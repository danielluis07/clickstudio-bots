import type { BusinessHours } from "@/modules/bot";
import type {
  ConversationStats,
  DailyConversations,
  RecentHandoff,
  StatsPeriod,
} from "@/modules/conversations/stats";

// Placeholder numbers for the home page until the stats read lands (#195).
// They follow the shape it will return, so wiring it swaps only the source.

const dayMs = 24 * 60 * 60 * 1000;

// A small seeded generator, so each period always shows the same numbers.
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const saoPauloDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });

const placeholderBusinessHours: BusinessHours = {
  monday: { opens: "09:00", closes: "18:00" },
  tuesday: { opens: "09:00", closes: "18:00" },
  wednesday: { opens: "09:00", closes: "18:00" },
  thursday: { opens: "09:00", closes: "18:00" },
  friday: { opens: "09:00", closes: "18:00" },
  saturday: { opens: "09:00", closes: "13:00" },
  sunday: null,
};

// Contacts write most late in the morning and in the evening.
const hourWeights = [
  2, 1, 1, 0, 0, 1, 2, 4, 7, 10, 12, 12, 9, 9, 10, 10, 9, 8, 9, 11, 12, 10, 7, 4,
];

const placeholderContacts: RecentHandoff["contact"][] = [
  { name: "Mariana Lopes", appName: null, profileName: "Mari", phone: "5511987654321" },
  { name: null, appName: "Carlos (orçamento)", profileName: "Carlos", phone: "5521998765432" },
  { name: null, appName: null, profileName: "Fernanda", phone: "5531991234567" },
  { name: null, appName: null, profileName: null, phone: "5511976543210" },
  { name: "Rafael Souza", appName: null, profileName: "Rafa", phone: "5541988776655" },
];

const placeholderReasons: RecentHandoff["reason"][] = [
  "contact_request",
  "no_answer",
  "handoff_topic",
  "claimed",
  "contact_request",
];

const placeholderDaily = (period: StatsPeriod, today: string, random: () => number) => {
  const end = Date.parse(`${today}T00:00:00Z`);
  return Array.from({ length: period }, (_, index): DailyConversations => {
    const day = new Date(end - (period - 1 - index) * dayMs);
    const weekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;
    const total = Math.round((weekend ? 18 : 42) + random() * (weekend ? 10 : 22));
    const withHandoff = Math.round(total * (0.18 + random() * 0.14));
    return { date: day.toISOString().slice(0, 10), botOnly: total - withHandoff, withHandoff };
  });
};

export const placeholderConversationStats = (period: StatsPeriod, now: Date): ConversationStats => {
  const random = seeded(period);
  const daily = placeholderDaily(period, saoPauloDate.format(now), random);
  const dayTotal = daily.reduce((sum, day) => sum + day.botOnly + day.withHandoff, 0);
  const dayHandoffs = daily.reduce((sum, day) => sum + day.withHandoff, 0);
  // A Conversation active on several days counts once in the period.
  const activeConversations = Math.round(dayTotal * 0.64);
  const messages = dayTotal * 6;
  const weightTotal = hourWeights.reduce((sum, weight) => sum + weight, 0);
  return {
    period,
    activeConversations,
    botOnlyConversations: activeConversations - Math.round(dayHandoffs * 0.7),
    newContacts: Math.round(activeConversations * 0.38),
    daily,
    contactMessagesByHour: hourWeights.map((weight, hour) => ({
      hour,
      messages: Math.round((messages * weight * (0.9 + random() * 0.2)) / weightTotal),
    })),
    businessHours: placeholderBusinessHours,
    latestHandoffs: placeholderContacts.map((contact, index) => ({
      conversationId: `placeholder-${index + 1}`,
      contact,
      reason: placeholderReasons[index],
      at: new Date(now.getTime() - [12, 47, 180, 1_260, 2_950][index] * 60 * 1000),
    })),
  };
};
