import "server-only";
import { db } from "@/db";
import { auth } from "@/server/auth/auth";
import type { TRPCContext } from "@/trpc/init";

type Session = Awaited<ReturnType<typeof auth.api.getSession>>;

export const contextForSession = (session: Session): TRPCContext => ({
  db,
  session: session
    ? { userId: session.user.id, activeTenantId: session.session.activeOrganizationId ?? null }
    : null,
});

export const createTRPCContext = async (headers: Headers) =>
  contextForSession(await auth.api.getSession({ headers }));
