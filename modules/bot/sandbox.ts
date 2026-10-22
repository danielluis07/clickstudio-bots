import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/database";
import { botSandboxUsage } from "@/db/schema";
import type { Model } from "@/modules/bot/model";
import { botTimeZone } from "@/modules/bot/schedule";
import { readBehaviour } from "@/modules/bot/settings";
import { createBotCore } from "@/modules/bot/turn";
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

export const sandboxInputSchema = z.strictObject({
  text: z.string().trim().min(1).max(4_096),
  history: z.array(sandboxMessageSchema).max(20),
});

export type SandboxMessage = z.infer<typeof sandboxMessageSchema>;

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
      const core = createBotCore({
        model,
        clock,
        repository: {
          getBehaviour: (turn) => readBehaviour(db, turn.scope),
          getKnowledgeBase: (turn) => readKnowledgeBase(db, turn.scope),
          listRecentMessages: async () => messages,
        },
        // Production cost and reply metering are never given to the sandbox.
        meter: { record: async () => {} },
      });
      const outcome = await core.respond({ scope, conversationId: "sandbox" });
      return {
        ok: true as const,
        outcome,
        allowance: { used: reserved.used, limit: sandboxDailyCap },
      };
    },
  };
};

export type BotSandbox = ReturnType<typeof createBotSandbox>;
