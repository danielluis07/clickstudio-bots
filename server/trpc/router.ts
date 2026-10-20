import { TRPCError, type inferRouterOutputs } from "@trpc/server";
import { contactDetailsSchema, createConversationRepository } from "@/modules/conversations";
import { createTRPCRouter, tenantProcedure } from "@/server/trpc/init";
import { z } from "zod";

export const appRouter = createTRPCRouter({
  conversations: createTRPCRouter({
    list: tenantProcedure.input(z.object({ search: z.string().max(120).optional() }).strict())
      .query(({ ctx, input }) => createConversationRepository(ctx.db, ctx.scope).listConversations(input)),
    get: tenantProcedure.input(z.object({ id: z.string().min(1) }).strict())
      .query(async ({ ctx, input }) => {
        const found = await createConversationRepository(ctx.db, ctx.scope).getConversation(input.id);
        if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Conversa não encontrada." });
        return found;
      }),
    messages: tenantProcedure.input(z.object({ conversationId: z.string().min(1) }).strict())
      .query(async ({ ctx, input }) => {
        const repository = createConversationRepository(ctx.db, ctx.scope);
        if (!await repository.getConversation(input.conversationId)) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Conversa não encontrada." });
        }
        return repository.listMessages(input.conversationId);
      }),
    updateContact: tenantProcedure.input(contactDetailsSchema.extend({ id: z.string().min(1) }).strict())
      .mutation(async ({ ctx, input }) => {
        const result = await createConversationRepository(ctx.db, ctx.scope).updateContact(input.id, input);
        if (!result.ok) throw new TRPCError({
          code: result.error === "not_found" ? "NOT_FOUND" : "BAD_REQUEST",
          message: result.error === "not_found" ? "Contato não encontrado." : "Confira o nome e o telefone informados.",
        });
        return result;
      }),
  }),
});

export type AppRouter = typeof appRouter;
export type RouterOutput = inferRouterOutputs<AppRouter>;
