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

  // The Member's own Alert preferences, for the Notificações settings and the
  // bell's sound and browser notification.
  preferences: tenantProcedure
    .input(z.strictObject({}).optional())
    .query(({ ctx }) => ctx.alertPreferences(ctx.scope).get()),

  // Changes only the switches given. Past Alerts stay as they are.
  updatePreferences: tenantProcedure
    .input(
      z.strictObject({
        handoff: z.boolean().optional(),
        teamMessage: z.boolean().optional(),
        anyMessage: z.boolean().optional(),
        sound: z.boolean().optional(),
        browserNotification: z.boolean().optional(),
      }),
    )
    .mutation(({ ctx, input }) => ctx.alertPreferences(ctx.scope).update(input)),

  clear: tenantProcedure
    .input(z.strictObject({}).optional())
    .mutation(({ ctx }) => ctx.alerts(ctx.scope).clear()),
});
