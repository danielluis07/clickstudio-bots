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
});
