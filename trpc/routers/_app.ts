import type { inferRouterOutputs } from "@trpc/server";
import { createTRPCRouter } from "@/trpc/init";
import { alertsRouter } from "@/trpc/routers/alerts";
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
import { billingRouter } from "@/trpc/routers/billing";

export const appRouter = createTRPCRouter({
  conversations: conversationsRouter,
  contacts: contactsRouter,
  replies: repliesRouter,
  handoff: handoffRouter,
  alerts: alertsRouter,
  realtime: realtimeRouter,
  tenancy: tenancyRouter,
  sandbox: sandboxRouter,
  bot: botRouter,
  channels: channelsRouter,
  billing: billingRouter,
});

export type AppRouter = typeof appRouter;
export type RouterOutput = inferRouterOutputs<AppRouter>;
