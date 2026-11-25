import { z } from "zod";
import { isOwner } from "@/modules/tenancy";
import { channelSignal } from "@/modules/channels";
import { createTRPCRouter, tenantProcedure } from "@/trpc/init";

export const channelsRouter = createTRPCRouter({
  // The dashboard header's Channel status, for any Member. Only the owner who
  // can connect (no Channel yet, or one waiting for a reconnection) receives
  // the public signup identifiers.
  status: tenantProcedure.input(z.void()).query(async ({ ctx }) => {
    const found = await ctx.channels.getChannel(ctx.scope);
    const owner = isOwner(ctx.scope);
    const canConnect = owner && (!found || found.canReconnect);
    return {
      isOwner: owner,
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
