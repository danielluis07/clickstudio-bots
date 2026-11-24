import { z } from "zod";
import { createTRPCRouter, tenantProcedure } from "@/trpc/init";

// The bell: the signed-in Member's own Alerts. No procedure takes a Member id.
export const alertsRouter = createTRPCRouter({
  list: tenantProcedure
    .input(z.strictObject({}).optional())
    .query(({ ctx }) => ctx.alerts(ctx.scope).list()),

  markConversationRead: tenantProcedure
    .input(z.strictObject({ conversationId: z.string() }))
    .mutation(({ ctx, input }) => ctx.alerts(ctx.scope).markConversationRead(input.conversationId)),

  clear: tenantProcedure
    .input(z.strictObject({}).optional())
    .mutation(({ ctx }) => ctx.alerts(ctx.scope).clear()),
});
