import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createConversationRepository } from "@/modules/conversations";
import { createTRPCRouter, tenantProcedure } from "@/trpc/init";

const orNotFound = <T>(value: T | null): T => {
  if (value === null) throw new TRPCError({ code: "NOT_FOUND" });
  return value;
};

export const conversationsRouter = createTRPCRouter({
  list: tenantProcedure
    .input(z.object({
      search: z.string().max(100).optional(),
      cursor: z.object({ lastMessageAt: z.date(), id: z.string() }).nullish(),
    }))
    .query(({ ctx, input }) => createConversationRepository(ctx.db, ctx.scope).listConversations(input)),

  get: tenantProcedure
    .input(z.object({ conversationId: z.string() }))
    .query(async ({ ctx, input }) =>
      orNotFound(await createConversationRepository(ctx.db, ctx.scope).getConversation(input.conversationId))),

  messages: tenantProcedure
    .input(z.object({
      conversationId: z.string(),
      cursor: z.object({ sentAt: z.date(), id: z.string() }).nullish(),
    }))
    .query(async ({ ctx, input }) =>
      orNotFound(await createConversationRepository(ctx.db, ctx.scope).listMessages(input.conversationId, input))),
});

export const contactsRouter = createTRPCRouter({
  rename: tenantProcedure
    .input(z.object({ contactId: z.string(), name: z.string().max(100) }))
    .mutation(async ({ ctx, input }) =>
      orNotFound(await createConversationRepository(ctx.db, ctx.scope).renameContact(input.contactId, input.name))),
});
