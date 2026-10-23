import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createConversationRepository,
  createHandoffControls,
  contactDetailLimits,
  deleteContact,
  updateContactDetails,
  type HandoffControls,
} from "@/modules/conversations";
import { systemClock } from "@/platform/clock";
import { createTRPCRouter, tenantProcedure } from "@/trpc/init";

const orNotFound = <T>(value: T | null): T => {
  if (value === null) throw new TRPCError({ code: "NOT_FOUND" });
  return value;
};

export const conversationsRouter = createTRPCRouter({
  list: tenantProcedure
    .input(
      z.object({
        search: z.string().max(100).optional(),
        waiting: z.boolean().optional(),
        cursor: z.object({ lastMessageAt: z.date(), id: z.string() }).nullish(),
      }),
    )
    .query(({ ctx, input }) =>
      createConversationRepository(ctx.db, ctx.scope).listConversations(input),
    ),

  get: tenantProcedure
    .input(z.object({ conversationId: z.string() }))
    .query(async ({ ctx, input }) =>
      orNotFound(
        await createConversationRepository(ctx.db, ctx.scope).getConversation(input.conversationId),
      ),
    ),

  messages: tenantProcedure
    .input(
      z.object({
        conversationId: z.string(),
        cursor: z.object({ sentAt: z.date(), id: z.string() }).nullish(),
      }),
    )
    .query(async ({ ctx, input }) =>
      orNotFound(
        await createConversationRepository(ctx.db, ctx.scope).listMessages(
          input.conversationId,
          input,
        ),
      ),
    ),
});

// Each refusal of the reply service as the browser sees it.
const replyErrors = {
  invalid: "BAD_REQUEST",
  not_found: "NOT_FOUND",
  window_closed: "PRECONDITION_FAILED",
  channel_unavailable: "PRECONDITION_FAILED",
  send_failed: "BAD_GATEWAY",
} as const;

export const repliesRouter = createTRPCRouter({
  send: tenantProcedure
    .input(z.object({ conversationId: z.string(), text: z.string().max(4096) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.replies.sendReply(ctx.scope, input);
      if (!result.ok)
        throw new TRPCError({ code: replyErrors[result.error], message: result.error });
    }),
});

export const contactsRouter = createTRPCRouter({
  delete: tenantProcedure
    .input(z.object({ contactId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const result = await deleteContact({
        db: ctx.db,
        scope: ctx.scope,
        notifier: ctx.notifier,
        clock: systemClock,
        ...input,
      });
      if (!result.ok)
        throw new TRPCError({ code: result.error === "forbidden" ? "FORBIDDEN" : "NOT_FOUND" });
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
      const result = await updateContactDetails({
        db: ctx.db,
        scope: ctx.scope,
        notifier: ctx.notifier,
        contactId,
        details,
      });
      if (!result.ok)
        throw new TRPCError({ code: result.error === "invalid" ? "BAD_REQUEST" : "NOT_FOUND" });
      return result.contact;
    }),
});

const handoffProcedure = (command: Exclude<keyof HandoffControls, "bulkReturnToBot">) =>
  tenantProcedure
    .input(z.object({ conversationId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const controls = createHandoffControls({ db: ctx.db, notifier: ctx.notifier });
      const result = await controls[command](ctx.scope, input.conversationId);
      if (!result.ok) throw new TRPCError({ code: "NOT_FOUND" });
    });

// Any Member, whoever took the Conversation over.
export const handoffRouter = createTRPCRouter({
  takeOver: handoffProcedure("takeOver"),
  returnToBot: handoffProcedure("returnToBot"),
  bulkReturnToBot: tenantProcedure
    .input(z.strictObject({ conversationIds: z.array(z.string().min(1)).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const result = await createHandoffControls({
        db: ctx.db,
        notifier: ctx.notifier,
      }).bulkReturnToBot(ctx.scope, input.conversationIds);
      if (!result.ok) throw new TRPCError({ code: "NOT_FOUND" });
    }),
  resolve: handoffProcedure("resolve"),
});
