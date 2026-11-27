import { z } from "zod";
import { isOwner } from "@/modules/tenancy";
import { createTRPCRouter, tenantProcedure } from "@/trpc/init";

export const billingRouter = createTRPCRouter({
  // What the dashboard's billing banner and navigation show. Every Member
  // sees a suspension; only those who may subscribe are offered the billing
  // page (the owner, and with billing off only the platform administrator).
  status: tenantProcedure.input(z.strictObject({}).optional()).query(async ({ ctx }) => {
    const { suspended } = await ctx.billing.status(ctx.scope);
    return {
      suspended,
      isOwner: isOwner(ctx.scope),
      billingPage: await ctx.billing.canManage(ctx.scope),
    };
  }),
});
