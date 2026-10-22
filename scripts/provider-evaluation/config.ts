import { z } from "zod";
import type { HumanReview } from "@/scripts/provider-evaluation/types";

const rate = z.number().finite().nonnegative();
export const evaluationConfigSchema = z
  .object({
    provider: z.string().min(1),
    modelId: z.string().min(1),
    // Optional factory for a candidate provider not installed in production.
    // Resolved relative to the config; exports createEvaluationModel({modelId}).
    adapterModule: z.string().min(1).optional(),
    hostingRegion: z.string().min(1),
    pricing: z
      .object({
        currency: z.literal("BRL"),
        inputPerMillion: rate,
        outputPerMillion: rate,
        cacheReadPerMillion: rate,
        cacheWritePerMillion: rate,
        source: z.string().min(1),
        checkedAt: z.iso.date(),
      })
      .strict(),
  })
  .strict();
export type EvaluationConfig = z.infer<typeof evaluationConfigSchema>;

export const reviewFileSchema = z
  .object({
    runId: z.string().min(1),
    reviewer: z.string().trim().min(1),
    reviewedAt: z.iso.datetime(),
    cases: z.array(
      z
        .object({
          caseId: z.string(),
          inventedCommitment: z.boolean(),
          grounded: z.boolean().nullable(),
          tone: z.number().int().min(1).max(5),
          naturalPtBr: z.boolean(),
          notes: z.string(),
        })
        .strict() satisfies z.ZodType<HumanReview>,
    ),
  })
  .strict();
