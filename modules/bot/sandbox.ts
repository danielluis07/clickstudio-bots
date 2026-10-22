import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/database";
import { botActivation, botSandboxUsage } from "@/db/schema";
import { readCapture } from "@/modules/bot/capture";
import type { Model } from "@/modules/bot/model";
import { botTimeZone } from "@/modules/bot/schedule";
import { readBehaviour } from "@/modules/bot/settings";
import { createBotCore } from "@/modules/bot/turn";
import {
  contactDetailSchemas,
  noContactDetails,
  type ContactDetails,
} from "@/modules/conversations";
import { readKnowledgeBase } from "@/modules/knowledge-base";
import type { TenantScope } from "@/modules/tenancy";
import type { Clock } from "@/platform/clock";

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
});

export type SandboxMessage = z.infer<typeof sandboxMessageSchema>;
export type SandboxContact = z.infer<typeof sandboxContactSchema>;

const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: botTimeZone });
const forbidden = { ok: false as const, error: "forbidden" as const };

export const createBotSandbox = ({
  db,
  clock,
  model,
}: {
  db: Database;
  clock: Clock;
  model: Model | null;
}) => {
  const getAllowance = async (scope: TenantScope) => {
    const [usage] = await db
      .select()
      .from(botSandboxUsage)
      .where(eq(botSandboxUsage.tenantId, scope.tenantId));
    return {
      used: usage?.day === dayFormatter.format(clock.now()) ? usage.turns : 0,
      limit: sandboxDailyCap,
    };
  };

  return {
    async status(scope: TenantScope) {
      if (scope.role !== "owner") return forbidden;
      return { ok: true as const, available: model !== null, allowance: await getAllowance(scope) };
    },

    async respond(scope: TenantScope, input: z.input<typeof sandboxInputSchema>) {
      if (scope.role !== "owner") return forbidden;
      const parsed = sandboxInputSchema.safeParse(input);
      if (!parsed.success) return { ok: false as const, error: "invalid" as const };
      if (!model) return { ok: false as const, error: "unavailable" as const };

      const now = clock.now();
      const day = dayFormatter.format(now);
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
          getBehaviour: (turn) => readBehaviour(db, turn.scope),
          getKnowledgeBase: (turn) => readKnowledgeBase(db, turn.scope),
          getCapture: (turn) => readCapture(db, turn.scope),
          getContactDetails: async () => contact,
          saveContactDetails: async (_turn, details) => {
            // As on a production Contact, a capture never replaces a name.
            contact = { ...contact, ...details, name: contact.name ?? details.name ?? null };
          },
          listRecentMessages: async () => messages,
        },
        // Production cost and reply metering are never given to the sandbox.
        meter: { record: async () => {} },
      });
      const outcome = await core.respond({ scope, conversationId: "sandbox" });
      if (
        outcome.kind === "answer" ||
        (outcome.kind === "handoff" && outcome.reason !== "bot_indisponivel")
      ) {
        await db
          .insert(botActivation)
          .values({ tenantId: scope.tenantId, testedAt: now })
          .onConflictDoUpdate({
            target: botActivation.tenantId,
            set: {
              testedAt: sql`greatest(${botActivation.testedAt}, ${now.toISOString()}::timestamptz)`,
            },
          });
      }
      return {
        ok: true as const,
        outcome,
        contact,
        allowance: { used: reserved.used, limit: sandboxDailyCap },
      };
    },
  };
};

export type BotSandbox = ReturnType<typeof createBotSandbox>;
