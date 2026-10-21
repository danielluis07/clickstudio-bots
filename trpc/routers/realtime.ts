import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, tenantProcedure } from "@/trpc/init";

export const realtimeRouter = createTRPCRouter({
  token: tenantProcedure
    // No caller-controlled Tenant, channel, clientId or capability.
    .input(z.strictObject({}).optional())
    .mutation(({ ctx }) => {
      if (!ctx.realtime) throw new TRPCError({ code: "PRECONDITION_FAILED" });
      return ctx.realtime.issueToken(ctx.scope.tenantId, ctx.scope.memberId);
    }),
});
