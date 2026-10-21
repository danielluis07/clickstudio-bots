import type { ModelUsage } from "@/modules/bot/model";
import type { BotTurn } from "@/modules/bot/repository";

// Counts, never content: what a turn cost, metered per Tenant.
export type TurnUsage = ModelUsage & {
  // Requests that returned tool results to the model.
  toolRoundTrips: number;
};

export interface UsageMeter {
  record(scope: BotTurn["scope"], at: Date, usage: TurnUsage): Promise<void>;
}
