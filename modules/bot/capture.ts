import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/database";
import { botCaptureSettings, member, user } from "@/db/schema";
import { createOwnerSavedSettings } from "@/modules/bot/owner-saved-settings";
import type { BotTurn } from "@/modules/bot/repository";
import {
  contactDetailFields,
  contactDetailSchemas,
  type ContactDetailField,
  type ContactDetails,
} from "@/modules/conversations";
import type { Clock } from "@/platform/clock";

// How the Bot treats one Contact detail: not asked for, captured when the
// Contact offers it, or required before a Handoff.
export const captureModes = ["off", "optional", "required"] as const;

export type CaptureMode = (typeof captureModes)[number];

// The capture capability as the Tenant's owner configured it.
export type CaptureSettings = {
  enabled: boolean;
  fields: Record<ContactDetailField, CaptureMode>;
};

// The details the Bot captures; none while the capability is disabled.
export const capturedFields = ({ enabled, fields }: CaptureSettings) =>
  enabled ? contactDetailFields.filter((field) => fields[field] !== "off") : [];

const fieldDescriptions: Record<ContactDetailField, string> = {
  name: "The Contact's name, as they stated it.",
  email: "The Contact's email address.",
  city: "The city where the Contact is.",
  need: "In a sentence, what the Contact needs from the business.",
};

// Only the Tenant's chosen fields, each optional, at least one present. A
// strict object refuses any other key, including a Contact or Tenant id.
export const captureInput = (capture: CaptureSettings) =>
  z
    .strictObject(
      Object.fromEntries(
        capturedFields(capture).map((field) => [
          field,
          contactDetailSchemas[field].optional().describe(fieldDescriptions[field]),
        ]),
      ) as Partial<Record<ContactDetailField, z.ZodOptional<z.ZodType<string>>>>,
    )
    .refine((details) => Object.keys(details).length > 0, "Send at least one detail.");

// Required details the Contact has not given yet; none while disabled.
export const missingRequired = (capture: CaptureSettings, details: Partial<ContactDetails>) =>
  capturedFields(capture).filter(
    (field) => capture.fields[field] === "required" && !details[field]?.trim(),
  );

const requestedDetails: Record<ContactDetailField, string> = {
  name: "seu nome",
  email: "seu e-mail",
  city: "sua cidade",
  need: "o que você precisa",
};

// Starts every request, so a later turn can tell the Bot already asked.
const detailsRequestOpening = "Antes de chamar a equipe, me informe";

const joinedInPortuguese = (items: string[]) =>
  items.length > 1 ? `${items.slice(0, -1).join(", ")} e ${items.at(-1)}` : items[0];

// The Bot's request for missing required details before a Handoff, after the
// answerable part of the Contact's message, if any.
export const detailsRequest = (missing: ContactDetailField[], answered: string) => {
  const request = `${detailsRequestOpening} ${joinedInPortuguese(missing.map((field) => requestedDetails[field]))}, por favor.`;
  return answered ? `${answered}\n\n${request}` : request;
};

export const isDetailsRequest = (text: string) => text.includes(detailsRequestOpening);

// Before the owner's first save.
export const disabledCapture: CaptureSettings = {
  enabled: false,
  fields: { name: "off", email: "off", city: "off", need: "off" },
};

const captureSchema = z
  .strictObject({
    enabled: z.boolean(),
    fields: z.strictObject({
      name: z.enum(captureModes),
      email: z.enum(captureModes),
      city: z.enum(captureModes),
      need: z.enum(captureModes),
    }),
  })
  // Enabled with nothing to capture would offer the Bot an empty tool.
  .refine(
    ({ enabled, fields }) =>
      !enabled || contactDetailFields.some((field) => fields[field] !== "off"),
  ) satisfies z.ZodType<CaptureSettings>;

// A field missing from an older save is off.
const toCapture = (saved: typeof botCaptureSettings.$inferSelect): CaptureSettings => ({
  enabled: saved.enabled,
  fields: Object.fromEntries(
    contactDetailFields.map((field) => [field, saved.fields[field] ?? "off"]),
  ) as CaptureSettings["fields"],
});

const loadCapture = async (db: Database, tenantId: string) => {
  const [found] = await db
    .select({ saved: botCaptureSettings, updatedBy: user.name })
    .from(botCaptureSettings)
    .leftJoin(member, eq(member.id, botCaptureSettings.updatedByMemberId))
    .leftJoin(user, eq(user.id, member.userId))
    .where(eq(botCaptureSettings.tenantId, tenantId));
  return {
    settings: found ? toCapture(found.saved) : disabledCapture,
    updatedAt: found?.saved.updatedAt ?? null,
    updatedBy: found?.updatedBy ?? null,
  };
};

// The capture settings as saved now, read on every turn so a saved change
// reaches the next reply.
export const readCapture = async (db: Database, scope: BotTurn["scope"]) =>
  (await loadCapture(db, scope.tenantId)).settings;

export const createCaptureSettingsEditor = ({ db, clock }: { db: Database; clock: Clock }) => {
  const settings = createOwnerSavedSettings({
    db,
    clock,
    schema: captureSchema,
    action: "capture_settings.saved",
    load: (tenantId) => loadCapture(db, tenantId),
    persist: async (tx, scope, values) => {
      await tx
        .insert(botCaptureSettings)
        .values({ tenantId: scope.tenantId, ...values })
        .onConflictDoUpdate({ target: botCaptureSettings.tenantId, set: values });
    },
  });
  return { getCapture: settings.get, saveCapture: settings.save };
};
