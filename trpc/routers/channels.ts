import { z } from "zod";
import { channelSignal } from "@/modules/channels";
import { createTRPCRouter, tenantProcedure } from "@/trpc/init";

export const channelsRouter = createTRPCRouter({
  // The dashboard header's Channel status, for any Member. Only the owner who
  // can connect (no Channel yet, or one waiting for a reconnection) receives
  // the public signup identifiers.
  status: tenantProcedure.input(z.void()).query(async ({ ctx }) => {
    const found = await ctx.channels.getChannel(ctx.scope);
    const isOwner = ctx.scope.role === "owner";
    const canConnect = isOwner && (!found || found.canReconnect);
    return {
      isOwner,
      canConnect,
      channel: found && {
        displayPhoneNumber: found.displayPhoneNumber,
        canReconnect: found.canReconnect,
        signal: channelSignal(found),
      },
      signup: canConnect ? ctx.signupConfig() : null,
    };
  }),
});
