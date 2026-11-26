import { z } from "zod";
import { createTRPCRouter, tenantProcedure } from "@/trpc/init";

export const tenancyRouter = createTRPCRouter({
  current: tenantProcedure
    .input(z.strictObject({}).optional())
    // The role only decides what the sidebar offers; every page and
    // operation still authorizes on its own.
    .query(async ({ ctx }) => {
      const tenant = await ctx.tenants(ctx.scope).getTenant();
      return tenant && { ...tenant, role: ctx.scope.role };
    }),

  // Whether the Tour has opened by itself for the last time: the Member
  // skipped or finished it in this Tenant.
  tour: tenantProcedure
    .input(z.strictObject({}).optional())
    .query(async ({ ctx }) => ({ seen: await ctx.tour(ctx.scope).seen() })),

  // Writes only the caller's own membership in the current Tenant.
  markTourSeen: tenantProcedure.input(z.strictObject({}).optional()).mutation(async ({ ctx }) => {
    await ctx.tour(ctx.scope).markSeen();
    return { ok: true as const };
  }),
});
