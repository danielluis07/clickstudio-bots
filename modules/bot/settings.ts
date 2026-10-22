import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/database";
import { botSettings, member, organization, user } from "@/db/schema";
import type { BehaviourSettings, BotTurn } from "@/modules/bot/repository";
import { botSchedules, weekdays, type BusinessHours } from "@/modules/bot/schedule";
import type { TenantScope } from "@/modules/tenancy";
import type { Clock } from "@/platform/clock";

// The longest each setting may be, in characters. They bound the prompt's
// behaviour part, which does not count toward the Knowledge base cap.
// Documented in docs/bot-settings.md.
export const botSettingsLimits = {
  businessName: 100,
  offer: 500,
  address: 300,
  greeting: 300,
  rules: 2_000,
  // Each refused or Handoff topic, and how many of each a Tenant may list.
  topic: 100,
  topics: 20,
};

export type BotSettingsLimits = typeof botSettingsLimits;

const tones = ["formal", "neutral", "casual"] as const satisfies BehaviourSettings["tone"][];

// Browsers submit a textarea's line breaks as CRLF but count them as one
// character. Characters, not UTF-16 units, so "é" counts as one.
const boundedText = (maxLength: number) =>
  z
    .string()
    .transform((text) => text.replaceAll("\r\n", "\n").trim())
    .pipe(z.string().refine((text) => [...text].length <= maxLength));

// Blank topics are dropped before the list is counted.
const topicList = z
  .array(boundedText(botSettingsLimits.topic))
  .transform((topics) => topics.filter(Boolean))
  .pipe(z.array(z.string()).max(botSettingsLimits.topics));

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const openingHours = z
  .strictObject({ opens: time, closes: time })
  .refine(({ opens, closes }) => opens < closes)
  .nullable();

const hoursSchema = z.strictObject({
  monday: openingHours,
  tuesday: openingHours,
  wednesday: openingHours,
  thursday: openingHours,
  friday: openingHours,
  saturday: openingHours,
  sunday: openingHours,
}) satisfies z.ZodType<BusinessHours>;

const settingsSchema = z
  .object({
    businessName: boundedText(botSettingsLimits.businessName).pipe(z.string().min(1)),
    offer: boundedText(botSettingsLimits.offer),
    address: boundedText(botSettingsLimits.address),
    hours: hoursSchema,
    tone: z.enum(tones),
    emoji: z.boolean(),
    greeting: boundedText(botSettingsLimits.greeting),
    rules: boundedText(botSettingsLimits.rules),
    refusedTopics: topicList,
    handoffTopics: topicList,
    schedule: z.enum(botSchedules),
  })
  // Without hours, "outside business hours" would silently mean always on.
  .refine(
    ({ schedule, hours }) => schedule === "always" || weekdays.some((day) => hours[day]),
  ) satisfies z.ZodType<BehaviourSettings>;

const invalid = { ok: false as const, error: "invalid" as const };
const forbidden = { ok: false as const, error: "forbidden" as const };

// Only the owner edits; every Member may read how the Bot behaves.
const isOwner = (scope: TenantScope) => scope.role === "owner";

type SavedSettings = typeof botSettings.$inferSelect;

// What the Bot uses until the owner first saves. The schedule is always on,
// but the Bot stays off until the owner activates it on the Channel.
const defaultSettings = (businessName: string): BehaviourSettings => ({
  businessName,
  offer: "",
  address: "",
  hours: {
    monday: null,
    tuesday: null,
    wednesday: null,
    thursday: null,
    friday: null,
    saturday: null,
    sunday: null,
  },
  tone: "neutral",
  emoji: false,
  greeting: "",
  rules: "",
  refusedTopics: [],
  handoffTopics: [],
  schedule: "always",
});

const toBehaviour = (saved: SavedSettings): BehaviourSettings => ({
  businessName: saved.businessName,
  offer: saved.offer,
  address: saved.address,
  hours: Object.fromEntries(
    weekdays.map((day) => [day, saved.hours[day] ?? null]),
  ) as BusinessHours,
  tone: saved.tone,
  emoji: saved.emoji,
  greeting: saved.greeting,
  rules: saved.rules,
  refusedTopics: saved.refusedTopics,
  handoffTopics: saved.handoffTopics,
  schedule: saved.schedule,
});

// The Tenant's settings as saved now, or its defaults before the first save.
// `updatedBy` is null before the first save and once that Member was removed.
const loadSettings = async (db: Database, tenantId: string) => {
  const [found] = await db
    .select({ tenantName: organization.name, saved: botSettings, updatedBy: user.name })
    .from(organization)
    .leftJoin(botSettings, eq(botSettings.tenantId, organization.id))
    .leftJoin(member, eq(member.id, botSettings.updatedByMemberId))
    .leftJoin(user, eq(user.id, member.userId))
    .where(eq(organization.id, tenantId));
  if (!found) throw new Error("Bot settings of a missing Tenant");
  return {
    settings: found.saved ? toBehaviour(found.saved) : defaultSettings(found.tenantName),
    updatedAt: found.saved?.updatedAt ?? null,
    updatedBy: found.updatedBy,
  };
};

// The settings as saved now, for a Bot turn's Tenant. Read on every turn with
// no cache of its own, so a saved edit reaches the next reply and the next
// schedule check.
export const readBehaviour = async (
  db: Database,
  scope: BotTurn["scope"],
): Promise<BehaviourSettings> => (await loadSettings(db, scope.tenantId)).settings;

export const createBotSettingsEditor = ({ db, clock }: { db: Database; clock: Clock }) => ({
  getSettings: (scope: TenantScope) => loadSettings(db, scope.tenantId),

  // Replaces every setting at once. Saving never touches Conversations: a
  // schedule change only affects whether the Bot may send its next reply.
  async saveSettings(scope: TenantScope, input: BehaviourSettings) {
    if (!isOwner(scope)) return forbidden;
    const parsed = settingsSchema.safeParse(input);
    if (!parsed.success) return invalid;
    const values = {
      ...parsed.data,
      updatedByMemberId: scope.memberId,
      updatedAt: clock.now(),
    };
    await db
      .insert(botSettings)
      .values({ tenantId: scope.tenantId, ...values })
      .onConflictDoUpdate({ target: botSettings.tenantId, set: values });
    return { ok: true as const };
  },
});
