import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { Database } from "@/db/database";
import type { TRPCSession } from "@/server/trpc/init";
import { appRouter } from "@/server/trpc/router";

export const createTRPCRoute = ({ db, getSession }: {
  db: Database;
  getSession: (headers: Headers) => Promise<TRPCSession | null>;
}) => (request: Request) => fetchRequestHandler({
  endpoint: "/api/trpc",
  req: request,
  router: appRouter,
  createContext: async () => ({ db, session: await getSession(request.headers) }),
  responseMeta: () => ({ headers: { "cache-control": "private, no-store" } }),
});
