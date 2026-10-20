import type { inferRouterOutputs } from "@trpc/server";
import { createTRPCRouter } from "@/trpc/init";
import { contactsRouter, conversationsRouter } from "@/trpc/routers/conversations";

export const appRouter = createTRPCRouter({
  conversations: conversationsRouter,
  contacts: contactsRouter,
});

export type AppRouter = typeof appRouter;
export type RouterOutput = inferRouterOutputs<AppRouter>;
