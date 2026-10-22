import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createBotActivation } from "@/modules/bot";
import { systemClock } from "@/platform/clock";
import { createTRPCRouter, tenantProcedure } from "@/trpc/init";

const failures = {
  forbidden: { code: "FORBIDDEN", message: "Apenas o responsável pelo negócio pode ativar o Bot." },
  incomplete: {
    code: "PRECONDITION_FAILED",
    message:
      "Conclua o perfil do negócio, a base de conhecimento e o teste do Bot, e conecte o WhatsApp antes de ativar.",
  },
  inactive: { code: "PRECONDITION_FAILED", message: "Ative o Bot antes de pausar ou retomar." },
  invalid: { code: "BAD_REQUEST", message: "Confira a opção de pausa do Bot." },
} as const;

export const botRouter = createTRPCRouter({
  usage: tenantProcedure.input(z.void()).query(async ({ ctx }) => {
    const usage = await ctx.allowance.status(ctx.scope);
    if (!usage)
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Apenas o responsável pelo negócio pode consultar o uso do Bot.",
      });
    return usage;
  }),
  status: tenantProcedure
    .input(z.void())
    .query(({ ctx }) => createBotActivation({ db: ctx.db, clock: systemClock }).status(ctx.scope)),
  activate: tenantProcedure.input(z.void()).mutation(async ({ ctx }) => {
    const result = await createBotActivation({ db: ctx.db, clock: systemClock }).activate(
      ctx.scope,
    );
    if (!result.ok) throw new TRPCError(failures[result.error]);
    return result;
  }),
  setPaused: tenantProcedure
    .input(z.strictObject({ paused: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const result = await createBotActivation({ db: ctx.db, clock: systemClock }).setPaused(
        ctx.scope,
        input.paused,
      );
      if (!result.ok) throw new TRPCError(failures[result.error]);
      return result;
    }),
});
