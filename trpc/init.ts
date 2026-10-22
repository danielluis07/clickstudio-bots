import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Database } from "@/db/database";
import type { ReplyService } from "@/modules/conversations";
import type { BotSandbox, ReplyAllowance } from "@/modules/bot";
import { resolveTenantScope } from "@/modules/tenancy";
import type { AblyRealtime } from "@/platform/ably";
import type { Notifier } from "@/platform/notifier";

// Built per request by `@/trpc/context`. Tests pass their own database and
// session, so this file must not import the live pool or Better Auth.
export type TRPCContext = {
  db: Database;
  // The signed-in user and the session's active Tenant, read from the cookie
  // on the server. The active Tenant is re-checked against membership.
  session: { userId: string; activeTenantId: string | null } | null;
  // Sends through WhatsApp; tests pass one built on a fake sender.
  replies: ReplyService;
  realtime: AblyRealtime | null;
  notifier: Notifier;
  sandbox: BotSandbox;
  allowance: ReplyAllowance;
};

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  // Unexpected errors reach the browser without their message, which can
  // carry Contact data from the database.
  errorFormatter: ({ shape, error }) =>
    error.code === "INTERNAL_SERVER_ERROR" ? { ...shape, message: "Internal server error" } : shape,
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;

// The only procedure there is. It resolves the TenantScope from authorized
// membership (ADR 0004), so procedures never accept a Tenant id as input and
// reach Tenant-owned data only through the scope.
export const tenantProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session) throw new TRPCError({ code: "UNAUTHORIZED" });
  const scope = await resolveTenantScope(ctx.db, ctx.session);
  if (!scope) throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx: { ...ctx, scope } });
});
