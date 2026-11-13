import { and, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { Database } from "@/db/database";
import { botSettings, member, organization, user } from "@/db/schema";
import { createOwnerSave } from "@/modules/bot/owner-saved-settings";
import type {
  BehaviourSettings,
  BotSettings,
  BotTurn,
  BusinessProfile,
} from "@/modules/bot/repository";
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

const profileSchema = z.object({
  businessName: boundedText(botSettingsLimits.businessName).pipe(z.string().min(1)),
  offer: boundedText(botSettingsLimits.offer),
  address: boundedText(botSettingsLimits.address),
  hours: hoursSchema,
}) satisfies z.ZodType<BusinessProfile>;

const behaviourSchema = z.object({
  tone: z.enum(tones),
  emoji: z.boolean(),
  greeting: boundedText(botSettingsLimits.greeting),
  rules: boundedText(botSettingsLimits.rules),
  refusedTopics: topicList,
  handoffTopics: topicList,
  schedule: z.enum(botSchedules),
}) satisfies z.ZodType<BehaviourSettings>;

type SavedSettings = typeof botSettings.$inferSelect;

// What the Bot uses until the owner first saves each part. The schedule is
// always on, but the Bot stays off until the owner activates it on the
// Channel.
const closedWeek: BusinessHours = {
  monday: null,
  tuesday: null,
  wednesday: null,
  thursday: null,
  friday: null,
  saturday: null,
  sunday: null,
};

const defaultBehaviour: BehaviourSettings = {
  tone: "neutral",
  emoji: false,
  greeting: "",
  rules: "",
  refusedTopics: [],
  handoffTopics: [],
  schedule: "always",
};

const defaultSettings = (businessName: string): BotSettings => ({
  businessName,
  offer: "",
  address: "",
  hours: closedWeek,
  ...defaultBehaviour,
});

const toSettings = (saved: SavedSettings): BotSettings => ({
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

// "Outside business hours only" needs at least one open day: without hours it
// would silently mean always on. Each part is saved alone, so the check reads
// the other part as saved now, in the statement that writes.
const hasOpenDay = sql`exists (select 1 from jsonb_each(${botSettings.hours}) as day where day.value <> 'null'::jsonb)`;

const profileMember = alias(member, "profile_member");
const profileUser = alias(user, "profile_user");
const behaviourMember = alias(member, "behaviour_member");
const behaviourUser = alias(user, "behaviour_user");

// The Tenant's settings as saved now, or their defaults before each part's
// first save, with when and by whom each part was last saved. A name is null
// before that part's first save and once that Member was removed.
const loadSettings = async (db: Database, tenantId: string) => {
  const [found] = await db
    .select({
      tenantName: organization.name,
      saved: botSettings,
      profileBy: profileUser.name,
      behaviourBy: behaviourUser.name,
    })
    .from(organization)
    .leftJoin(botSettings, eq(botSettings.tenantId, organization.id))
    .leftJoin(profileMember, eq(profileMember.id, botSettings.profileUpdatedByMemberId))
    .leftJoin(profileUser, eq(profileUser.id, profileMember.userId))
    .leftJoin(behaviourMember, eq(behaviourMember.id, botSettings.behaviourUpdatedByMemberId))
    .leftJoin(behaviourUser, eq(behaviourUser.id, behaviourMember.userId))
    .where(eq(organization.id, tenantId));
  if (!found) throw new Error("Bot settings of a missing Tenant");
  const { saved } = found;
  return {
    settings: saved ? toSettings(saved) : defaultSettings(found.tenantName),
    profile: { updatedAt: saved?.profileUpdatedAt ?? null, updatedBy: found.profileBy },
    behaviour: { updatedAt: saved?.behaviourUpdatedAt ?? null, updatedBy: found.behaviourBy },
  };
};

// The settings as saved now, for a Bot turn's Tenant. Read on every turn with
// no cache of its own, so a saved edit reaches the next reply and the next
// schedule check.
export const readBotSettings = async (
  db: Database,
  scope: BotTurn["scope"],
): Promise<BotSettings> => (await loadSettings(db, scope.tenantId)).settings;

const savedTenant = { tenantId: botSettings.tenantId };

export const createBotSettingsEditor = ({ db, clock }: { db: Database; clock: Clock }) => ({
  getSettings: (scope: TenantScope) => loadSettings(db, scope.tenantId),

  // Before the first Behaviour settings save, the row holds their defaults.
  // Closing every day is refused while the Bot replies only outside them.
  saveProfile: createOwnerSave({
    db,
    clock,
    schema: profileSchema,
    action: "business_profile.saved",
    persist: async (tx, scope, { updatedAt, updatedByMemberId, ...profile }) => {
      const set = {
        ...profile,
        updatedAt,
        updatedByMemberId,
        profileUpdatedAt: updatedAt,
        profileUpdatedByMemberId: updatedByMemberId,
      };
      const saved = await tx
        .insert(botSettings)
        .values({ tenantId: scope.tenantId, ...defaultBehaviour, ...set })
        .onConflictDoUpdate({
          target: botSettings.tenantId,
          set,
          setWhere: weekdays.some((day) => profile.hours[day])
            ? undefined
            : eq(botSettings.schedule, "always"),
        })
        .returning(savedTenant);
      if (saved.length === 0) return "invalid";
    },
  }),

  // Before the first Business profile save, the row holds its defaults, named
  // after the Tenant. Saving never touches Conversations: a schedule change
  // only affects whether the Bot may send its next reply.
  saveBehaviour: createOwnerSave({
    db,
    clock,
    schema: behaviourSchema,
    action: "behaviour_settings.saved",
    persist: async (tx, scope, { updatedAt, updatedByMemberId, ...behaviour }) => {
      const set = {
        ...behaviour,
        updatedAt,
        updatedByMemberId,
        behaviourUpdatedAt: updatedAt,
        behaviourUpdatedByMemberId: updatedByMemberId,
      };
      // Without a saved profile there are no hours to be outside of, so only
      // an existing row with an open day can take that schedule.
      const saved =
        behaviour.schedule === "always"
          ? await tx
              .insert(botSettings)
              .values({
                tenantId: scope.tenantId,
                ...defaultSettings(""),
                businessName: sql`(select ${organization.name} from ${organization} where ${organization.id} = ${scope.tenantId})`,
                ...set,
              })
              .onConflictDoUpdate({ target: botSettings.tenantId, set })
              .returning(savedTenant)
          : await tx
              .update(botSettings)
              .set(set)
              .where(and(eq(botSettings.tenantId, scope.tenantId), hasOpenDay))
              .returning(savedTenant);
      if (saved.length === 0) return "invalid";
    },
  }),
});
