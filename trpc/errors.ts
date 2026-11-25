import { TRPCError } from "@trpc/server";
import type { TRPC_ERROR_CODE_KEY } from "@trpc/server/rpc";
import { reportError, type Diagnostics } from "@/platform/diagnostics";

// Refusals (unauthorized, not found, bad input) are answers, not failures.
// Only an unexpected error goes to Sentry, recorded from its cause: tRPC
// wraps what the procedure threw, and database errors can echo Contact
// names and phones in their messages.
export const reportTRPCError = async (
  diagnostics: Diagnostics,
  path: string | undefined,
  error: TRPCError,
) => {
  if (error.code !== "INTERNAL_SERVER_ERROR") return;
  await reportError(diagnostics, "trpc_procedure_failed", error.cause ?? error, {
    operation: path,
  });
};

// How one module refusal reaches the browser: a code, or a code with the
// pt-BR message the screen shows.
type Failure = TRPC_ERROR_CODE_KEY | { code: TRPC_ERROR_CODE_KEY; message: string };

type RefusalOf<R> = Extract<R, { ok: false }> extends { error: infer E extends string } ? E : never;

// Returns a module result's success value, or throws the TRPCError its error
// maps to. `failures` must name every error the result can carry.
export const unwrap = <R extends { ok: boolean }>(
  result: R,
  failures: Record<RefusalOf<R>, Failure>,
): Extract<R, { ok: true }> => {
  if (result.ok) return result as Extract<R, { ok: true }>;
  const { error } = result as unknown as { error: RefusalOf<R> };
  const failure = failures[error];
  throw new TRPCError(typeof failure === "string" ? { code: failure } : failure);
};

// A lookup that found nothing is a NOT_FOUND.
export const orNotFound = <T>(value: T | null): T => {
  if (value === null) throw new TRPCError({ code: "NOT_FOUND" });
  return value;
};
