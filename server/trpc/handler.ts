import { db } from "@/db";
import { auth } from "@/server/auth/auth";
import { createTRPCRoute } from "@/server/trpc/route";

export const trpcHandler = createTRPCRoute({ db, getSession: (headers) => auth.api.getSession({ headers }) });
