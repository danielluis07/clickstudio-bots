import type { TRPCError } from "@trpc/server";
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
