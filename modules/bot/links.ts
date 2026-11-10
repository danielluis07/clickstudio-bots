import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/database";
import { botLinkSettings, member, user } from "@/db/schema";
import { createOwnerSavedSettings } from "@/modules/bot/owner-saved-settings";
import type { BotTurn } from "@/modules/bot/repository";
import type { Clock } from "@/platform/clock";

export type ConfiguredLink = { id: string; label: string; url: string };
export type LinkSettings = { enabled: boolean; links: ConfiguredLink[] };
export const linkSettingsLimits = { links: 20, label: 100, url: 2_048 };
export type LinkSettingsLimits = typeof linkSettingsLimits;
export const disabledLinks: LinkSettings = { enabled: false, links: [] };

const linkSchema = z.strictObject({
  id: z.uuid(),
  label: z
    .string()
    .trim()
    .min(1)
    .max(linkSettingsLimits.label)
    .regex(/^[^\r\n]+$/),
  // These addresses are sent as text, never fetched. Refuse scripts and credentials.
  url: z
    .string()
    .trim()
    .max(linkSettingsLimits.url)
    .pipe(z.url({ protocol: /^https?$/ }))
    .refine((value) => {
      if (!URL.canParse(value)) return false;
      const url = new URL(value);
      return /^https?:\/\//i.test(value) && !url.username && !url.password && !/\s/.test(value);
    }),
});
const settingsSchema = z
  .strictObject({
    enabled: z.boolean(),
    links: z.array(linkSchema).max(linkSettingsLimits.links),
  })
  .refine(
    ({ links, enabled }) =>
      (!enabled || links.length > 0) && new Set(links.map(({ id }) => id)).size === links.length,
  );

export const availableLinks = (settings: LinkSettings) => (settings.enabled ? settings.links : []);

// Successful link calls use only configured URLs and platform wording.
// Model prose is discarded so it cannot invent a completed booking or payment.
export const configuredLinkReply = (links: ConfiguredLink[]) =>
  [
    ...links.map(({ url }) => `Acesse o link: ${url}`),
    "O envio deste link não confirma agendamento nem pagamento. A equipe pode ajudar se precisar.",
  ].join("\n\n");

const loadLinks = async (db: Database, tenantId: string) => {
  const [found] = await db
    .select({ saved: botLinkSettings, updatedBy: user.name })
    .from(botLinkSettings)
    .leftJoin(member, eq(member.id, botLinkSettings.updatedByMemberId))
    .leftJoin(user, eq(user.id, member.userId))
    .where(eq(botLinkSettings.tenantId, tenantId));
  return {
    settings: found ? { enabled: found.saved.enabled, links: found.saved.links } : disabledLinks,
    updatedAt: found?.saved.updatedAt ?? null,
    updatedBy: found?.updatedBy ?? null,
  };
};

export const readLinks = async (db: Database, scope: BotTurn["scope"]) =>
  (await loadLinks(db, scope.tenantId)).settings;

export const createLinkSettingsEditor = ({ db, clock }: { db: Database; clock: Clock }) => {
  const settings = createOwnerSavedSettings({
    db,
    clock,
    schema: settingsSchema,
    action: "link_settings.saved",
    load: (tenantId) => loadLinks(db, tenantId),
    persist: async (tx, scope, values) => {
      await tx
        .insert(botLinkSettings)
        .values({ tenantId: scope.tenantId, ...values })
        .onConflictDoUpdate({ target: botLinkSettings.tenantId, set: values });
    },
  });
  return { getLinks: settings.get, saveLinks: settings.save };
};
