import { z } from "zod";
import { createTenantRepository } from "@/modules/tenancy";
import { createTRPCRouter, tenantProcedure } from "@/trpc/init";

export const tenancyRouter = createTRPCRouter({
  current: tenantProcedure
    .input(z.strictObject({}).optional())
    .query(({ ctx }) => createTenantRepository(ctx.db, ctx.scope).getTenant()),
});
