import { z } from "zod";
import { createTRPCRouter, tenantProcedure } from "@/trpc/init";

export const tenancyRouter = createTRPCRouter({
  current: tenantProcedure
    .input(z.strictObject({}).optional())
    .query(({ ctx }) => ctx.tenants(ctx.scope).getTenant()),
});
