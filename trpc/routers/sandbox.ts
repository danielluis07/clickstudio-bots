import { z } from "zod";
import { sandboxInputSchema } from "@/modules/bot";
import { unwrap } from "@/trpc/errors";
import { createTRPCRouter, tenantProcedure } from "@/trpc/init";

const failures = {
  forbidden: { code: "FORBIDDEN", message: "Apenas o responsável pelo negócio pode testar o Bot." },
  invalid: { code: "BAD_REQUEST", message: "Escreva uma mensagem de até 4.096 caracteres." },
  unavailable: {
    code: "PRECONDITION_FAILED",
    message: "O teste do Bot está indisponível no momento. Tente novamente mais tarde.",
  },
  daily_cap: {
    code: "TOO_MANY_REQUESTS",
    message:
      "Você atingiu o limite diário de testes do Bot. Tente novamente amanhã, após a meia-noite no horário de São Paulo.",
  },
} as const;

export const sandboxRouter = createTRPCRouter({
  status: tenantProcedure
    .input(z.void())
    .query(async ({ ctx }) => unwrap(await ctx.sandbox.status(ctx.scope), failures)),

  respond: tenantProcedure
    .input(sandboxInputSchema)
    .mutation(async ({ ctx, input }) =>
      unwrap(await ctx.sandbox.respond(ctx.scope, input), failures),
    ),
});
