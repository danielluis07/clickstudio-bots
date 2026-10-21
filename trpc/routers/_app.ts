import type { inferRouterOutputs } from "@trpc/server";
import { createTRPCRouter } from "@/trpc/init";
import { contactsRouter, conversationsRouter, repliesRouter } from "@/trpc/routers/conversations";
import { realtimeRouter } from "@/trpc/routers/realtime";

export const appRouter = createTRPCRouter({
  conversations: conversationsRouter,
  contacts: contactsRouter,
  replies: repliesRouter,
  realtime: realtimeRouter,
});

export type AppRouter = typeof appRouter;
export type RouterOutput = inferRouterOutputs<AppRouter>;
