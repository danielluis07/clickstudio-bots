import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { z, ZodError } from "zod";
import type { Database } from "@/db/database";
import { resolveTenantScope } from "@/modules/tenancy";

export type TRPCSession = {
  user: { id: string; role?: string | null };
  session: { activeOrganizationId?: string | null };
};

export type TRPCContext = { db: Database; session: TRPCSession | null };

// A refusal that names the input it is about attaches this as the TRPCError's
// cause; the errorFormatter lifts the name to `data.field` so the form that
// submitted it can render the message inline.
export class FieldError extends Error {
  constructor(readonly field: string) {
    super(`Invalid field: ${field}`);
    this.name = "FieldError";
  }
}

// Avoid exporting the entire t-object
// since it's not very descriptive.
// For instance, the use of a t variable
// is common in i18n libraries.
const t = initTRPC.context<TRPCContext>().create({
  /**
   * @see https://trpc.io/docs/server/data-transformers
   */
  transformer: superjson,
  /**
   * Two payloads ride along with every error, and their presence is what tells
   * the global toast handler to stand down. `zodError` is built with
   * Zod 4's z.treeifyError() — tRPC's published recipe still calls the Zod 3
   * `error.flatten()`, which this version does not have.
   */
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? z.treeifyError(error.cause as ZodError<Record<string, unknown>>) : null,
        field: error.cause instanceof FieldError ? error.cause.field : null,
      },
    };
  },
});
// Base router and procedure helpers
export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const baseProcedure = t.procedure;
export const protectedProcedure = baseProcedure.use(async ({ ctx, next }) => {
  const session = ctx.session;

  if (!session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Entre na sua conta para continuar." });
  }

  return next({ ctx: { ...ctx, auth: session } });
});
export const tenantProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const scope = await resolveTenantScope(ctx.db, {
    userId: ctx.auth.user.id,
    activeTenantId: ctx.auth.session.activeOrganizationId,
  });
  if (!scope) throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a este negócio." });
  return next({ ctx: { ...ctx, scope } });
});
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.auth.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Acesso restrito ao administrador",
    });
  }

  return next({
    ctx: {
      ...ctx,
      adminId: ctx.auth.user.id,
    },
  });
});
