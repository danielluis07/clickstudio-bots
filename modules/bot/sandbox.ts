import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/database";
import { botSandboxUsage, modelHandoffReasons } from "@/db/schema";
import type { BotActivation } from "@/modules/bot/activation";
import { readBotConfiguration } from "@/modules/bot/configuration";
import type { Model } from "@/modules/bot/model";
import { createBotCore, splitTokens } from "@/modules/bot/turn";
import {
  contactDetailSchemas,
  noContactDetails,
  type ContactDetails,
} from "@/modules/conversations";
import { isOwner, forbidden, type TenantScope } from "@/modules/tenancy";
import type { Clock } from "@/platform/clock";
import { localDay } from "@/platform/time";

export const sandboxDailyCap = 50;

// History belongs only to the owner's browser. There are no production ids in
// this contract and no repository capable of writing Contacts or Conversations.
const sandboxMessageSchema = z.strictObject({
  author: z.enum(["contact", "bot"]),
  text: z.string().min(1).max(8_000),
});

// The test Contact's details, captured earlier in this browser's transcript.
const sandboxContactSchema = z.strictObject({
  name: contactDetailSchemas.name.nullable(),
  email: contactDetailSchemas.email.nullable(),
  city: contactDetailSchemas.city.nullable(),
  need: contactDetailSchemas.need.nullable(),
}) satisfies z.ZodType<ContactDetails>;

export const sandboxInputSchema = z.strictObject({
  text: z.string().trim().min(1).max(4_096),
  history: z.array(sandboxMessageSchema).max(20),
  contact: sandboxContactSchema.optional(),
  // The Handoff the Bot's latest reply put off to ask for required details,
  // as the previous response returned it.
  pendingHandoff: z.enum(modelHandoffReasons).nullable().optional(),
});

export type SandboxMessage = z.infer<typeof sandboxMessageSchema>;
export type SandboxContact = z.infer<typeof sandboxContactSchema>;

export const createBotSandbox = ({
  db,
  clock,
  model,
  activation,
}: {
  db: Database;
  clock: Clock;
  model: Model | null;
  activation: Pick<BotActivation, "markTested">;
}) => {
  const getAllowance = async (scope: TenantScope) => {
    const [usage] = await db
      .select()
      .from(botSandboxUsage)
      .where(eq(botSandboxUsage.tenantId, scope.tenantId));
    return {
      used: usage?.day === localDay(clock.now()) ? usage.turns : 0,
      limit: sandboxDailyCap,
    };
  };

  return {
    async status(scope: TenantScope) {
      if (!isOwner(scope)) return forbidden;
      return { ok: true as const, available: model !== null, allowance: await getAllowance(scope) };
    },

    async respond(scope: TenantScope, input: z.input<typeof sandboxInputSchema>) {
      if (!isOwner(scope)) return forbidden;
      const parsed = sandboxInputSchema.safeParse(input);
      if (!parsed.success) return { ok: false as const, error: "invalid" as const };
      if (!model) return { ok: false as const, error: "unavailable" as const };

      const now = clock.now();
      const day = localDay(now);
      // Reserve before the Model call, without holding a transaction across it.
      // A delayed prior-day request counts toward the persisted later day; it
      // must never roll that day backward or erase its usage. Failures count too.
      const [reserved] = await db
        .insert(botSandboxUsage)
        .values({ tenantId: scope.tenantId, day, turns: 1 })
        .onConflictDoUpdate({
          target: botSandboxUsage.tenantId,
          set: {
            day: sql`greatest(${botSandboxUsage.day}, ${day}::date)`,
            turns: sql`case when ${botSandboxUsage.day} < ${day} then 1 else ${botSandboxUsage.turns} + 1 end`,
          },
          setWhere: sql`${botSandboxUsage.day} < ${day} or ${botSandboxUsage.turns} < ${sandboxDailyCap}`,
        })
        .returning({ used: botSandboxUsage.turns });
      if (!reserved) return { ok: false as const, error: "daily_cap" as const };

      const messages = [
        ...parsed.data.history,
        { author: "contact" as const, text: parsed.data.text },
      ].map((message) => ({ ...message, sentAt: now }));
      // Captured details stay with this request and go back to the browser;
      // no production Contact exists to write to.
      let contact: ContactDetails = parsed.data.contact ?? noContactDetails;
      const core = createBotCore({
        model,
        clock,
        repository: {
          getConfiguration: (turn) => readBotConfiguration(db, turn.scope),
          getContactDetails: async () => contact,
          saveContactDetails: async (_turn, details) => {
            // As on a production Contact, a capture never replaces a name.
            contact = { ...contact, ...details, name: contact.name ?? details.name ?? null };
          },
          listRecentMessages: async () => messages,
          // The transcript has no times: the request is as recent as this message.
          getPendingHandoff: async () => {
            const reason = parsed.data.pendingHandoff;
            return reason ? { reason, askedAt: now } : null;
          },
        },
      });
      const outcome = await core.respond({ scope, conversationId: "sandbox" });
      if (
        outcome.kind === "answer" ||
        (outcome.kind === "handoff" && outcome.reason !== "bot_unavailable")
      ) {
        await activation.markTested(scope, now);
      }
      return {
        ok: true as const,
        // Token counts are production cost data; the sandbox never shows them.
        outcome: splitTokens(outcome).decision,
        contact,
        allowance: { used: reserved.used, limit: sandboxDailyCap },
      };
    },
  };
};

export type BotSandbox = ReturnType<typeof createBotSandbox>;
