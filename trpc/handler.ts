import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createTRPCContext } from "@/trpc/context";
import { appRouter } from "@/trpc/routers/_app";

export const handleTRPCRequest = (request: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
    createContext: () => createTRPCContext(request.headers),
    // Logged without detail: database errors can echo Contact names and phones.
    onError: ({ path, error }) => {
      if (error.code === "INTERNAL_SERVER_ERROR") console.error("tRPC procedure failed", { path });
    },
  });
