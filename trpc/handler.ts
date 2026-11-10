import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { waitUntil } from "@vercel/functions";
import { diagnostics } from "@/server/services";
import { createTRPCContext } from "@/trpc/context";
import { reportTRPCError } from "@/trpc/errors";
import { appRouter } from "@/trpc/routers/_app";

export const handleTRPCRequest = (request: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
    createContext: () => createTRPCContext(request.headers),
    // Sent after the response: the Member is not kept waiting on Sentry.
    onError: ({ path, error }) => waitUntil(reportTRPCError(diagnostics, path, error)),
  });
