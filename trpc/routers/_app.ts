import type { inferRouterOutputs } from "@trpc/server";
import { createTRPCRouter } from "@/trpc/init";
import {
  contactsRouter,
  conversationsRouter,
  handoffRouter,
  repliesRouter,
} from "@/trpc/routers/conversations";
import { realtimeRouter } from "@/trpc/routers/realtime";
import { tenancyRouter } from "@/trpc/routers/tenancy";
import { sandboxRouter } from "@/trpc/routers/sandbox";
import { botRouter } from "@/trpc/routers/bot";
import { channelsRouter } from "@/trpc/routers/channels";

export const appRouter = createTRPCRouter({
  conversations: conversationsRouter,
  contacts: contactsRouter,
  replies: repliesRouter,
  handoff: handoffRouter,
  realtime: realtimeRouter,
  tenancy: tenancyRouter,
  sandbox: sandboxRouter,
  bot: botRouter,
  channels: channelsRouter,
});

export type AppRouter = typeof appRouter;
export type RouterOutput = inferRouterOutputs<AppRouter>;
