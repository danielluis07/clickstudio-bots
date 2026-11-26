import { z } from "zod";
import { isOwner } from "@/modules/tenancy";
import { createTRPCRouter, tenantProcedure } from "@/trpc/init";

export const billingRouter = createTRPCRouter({
  // What the dashboard's billing banner shows. Every Member sees a
  // suspension; only the owner is offered the billing page.
  status: tenantProcedure.input(z.strictObject({}).optional()).query(async ({ ctx }) => {
    const { suspended } = await ctx.billing.status(ctx.scope);
    return { suspended, isOwner: isOwner(ctx.scope) };
  }),
});
