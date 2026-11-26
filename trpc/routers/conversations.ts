import { z } from "zod";
import {
  contactDetailLimits,
  statsPeriods,
  updateContactDetails,
  type HandoffControls,
} from "@/modules/conversations";
import { orNotFound, unwrap } from "@/trpc/errors";
import { createTRPCRouter, tenantProcedure } from "@/trpc/init";

export const conversationsRouter = createTRPCRouter({
  list: tenantProcedure
    .input(
      z.object({
        search: z.string().max(100).optional(),
        waiting: z.boolean().optional(),
        cursor: z.object({ lastMessageAt: z.date(), id: z.string() }).nullish(),
      }),
    )
    .query(({ ctx, input }) => ctx.conversations(ctx.scope).listConversations(input)),

  get: tenantProcedure
    .input(z.object({ conversationId: z.string() }))
    .query(async ({ ctx, input }) =>
      orNotFound(await ctx.conversations(ctx.scope).getConversation(input.conversationId)),
    ),

  messages: tenantProcedure
    .input(
      z.object({
        conversationId: z.string(),
        cursor: z.object({ sentAt: z.date(), id: z.string() }).nullish(),
      }),
    )
    .query(async ({ ctx, input }) =>
      orNotFound(await ctx.conversations(ctx.scope).listMessages(input.conversationId, input)),
    ),

  // The thread's dividers: when and why the Conversation passed to the team
  // or back to the Bot.
  handoffs: tenantProcedure
    .input(z.object({ conversationId: z.string() }))
    .query(async ({ ctx, input }) =>
      orNotFound(await ctx.conversations(ctx.scope).listHandoffs(input.conversationId)),
    ),

  // The home page's stats for the last 7, 30 or 90 São Paulo days.
  stats: tenantProcedure
    .input(
      z.strictObject({
        period: z.union(statsPeriods.map((period) => z.literal(period))),
      }),
    )
    .query(({ ctx, input }) => ctx.conversationStats.read(ctx.scope, input.period)),
});

// Each refusal of the reply service as the browser sees it. The message is
// the error name, which the Reply composer reads.
const replyFailures = {
  invalid: { code: "BAD_REQUEST", message: "invalid" },
  not_found: { code: "NOT_FOUND", message: "not_found" },
  window_closed: { code: "PRECONDITION_FAILED", message: "window_closed" },
  channel_unavailable: { code: "PRECONDITION_FAILED", message: "channel_unavailable" },
  send_failed: { code: "BAD_GATEWAY", message: "send_failed" },
} as const;

export const repliesRouter = createTRPCRouter({
  send: tenantProcedure
    .input(z.object({ conversationId: z.string(), text: z.string().max(4096) }))
    .mutation(async ({ ctx, input }) => {
      unwrap(await ctx.replies.sendReply(ctx.scope, input), replyFailures);
    }),
});

export const contactsRouter = createTRPCRouter({
  delete: tenantProcedure
    .input(z.object({ contactId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      unwrap(await ctx.deleteContact(ctx.scope, input.contactId), {
        forbidden: "FORBIDDEN",
        not_found: "NOT_FOUND",
      });
    }),

  // Every detail at once, as the Contact panel shows them. The module checks
  // each value's bounds in characters and that the Contact is the Tenant's;
  // these UTF-16 bounds only cap the request.
  update: tenantProcedure
    .input(
      z.object({
        contactId: z.string(),
        name: z.string().max(contactDetailLimits.name * 2),
        email: z.string().max(contactDetailLimits.email * 2),
        city: z.string().max(contactDetailLimits.city * 2),
        need: z.string().max(contactDetailLimits.need * 2),
      }),
    )
    .mutation(async ({ ctx, input: { contactId, ...details } }) => {
      const result = unwrap(
        await updateContactDetails({
          db: ctx.db,
          scope: ctx.scope,
          notifier: ctx.notifier,
          contactId,
          details,
        }),
        { invalid: "BAD_REQUEST", not_found: "NOT_FOUND" },
      );
      return result.contact;
    }),
});

const handoffProcedure = (command: Exclude<keyof HandoffControls, "bulkReturnToBot">) =>
  tenantProcedure
    .input(z.object({ conversationId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      unwrap(await ctx.handoff[command](ctx.scope, input.conversationId), {
        not_found: "NOT_FOUND",
      });
    });

// Any Member, whoever took the Conversation over.
export const handoffRouter = createTRPCRouter({
  takeOver: handoffProcedure("takeOver"),
  returnToBot: handoffProcedure("returnToBot"),
  bulkReturnToBot: tenantProcedure
    .input(z.strictObject({ conversationIds: z.array(z.string().min(1)).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      unwrap(await ctx.handoff.bulkReturnToBot(ctx.scope, input.conversationIds), {
        not_found: "NOT_FOUND",
      });
    }),
  resolve: handoffProcedure("resolve"),
});
