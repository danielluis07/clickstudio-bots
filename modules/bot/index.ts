// The Bot core: one turn decides a grounded answer or a Handoff, behind the
// Model, repository and usage ports.
export type { ContextLimits } from "@/modules/bot/context";
export type {
  Model,
  ModelMessage,
  ModelRequest,
  ModelResponse,
  ModelTool,
  ModelToolCall,
  ModelToolRefusal,
  ModelUsage,
} from "@/modules/bot/model";
export type {
  BehaviourSettings,
  BotRepository,
  BotTurn,
  ContextMessage,
  ContextWindow,
  KnowledgeBase,
} from "@/modules/bot/repository";
export {
  botSchedules,
  botTimeZone,
  weekdays,
  type BotSchedule,
  type BusinessHours,
  type OpeningHours,
  type Weekday,
} from "@/modules/bot/schedule";
export {
  botSettingsLimits,
  createBotSettingsEditor,
  readBehaviour,
  type BotSettingsLimits,
} from "@/modules/bot/settings";
export type { HandoffReason } from "@/modules/bot/tools";
export { createBotCore, type BotCore, type TurnOutcome } from "@/modules/bot/turn";
export type { TurnUsage, UsageMeter } from "@/modules/bot/usage";
export {
  createBotSandbox,
  sandboxDailyCap,
  sandboxInputSchema,
  type BotSandbox,
  type SandboxMessage,
} from "@/modules/bot/sandbox";
