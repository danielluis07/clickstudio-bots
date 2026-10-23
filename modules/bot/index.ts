// The Bot core: one turn decides a grounded answer or a Handoff, behind the
// Model, repository and usage ports.
export { createBotActivation } from "@/modules/bot/activation";
export {
  createLinkSettingsEditor,
  readLinks,
  disabledLinks,
  linkSettingsLimits,
  type ConfiguredLink,
  type LinkSettings,
  type LinkSettingsLimits,
} from "@/modules/bot/links";
export {
  captureModes,
  createCaptureSettingsEditor,
  disabledCapture,
  readCapture,
  type CaptureMode,
  type CaptureSettings,
} from "@/modules/bot/capture";
export { createLiveBot, type LiveBot, type BotJob, type BotJobQueue } from "@/modules/bot/live";
export {
  createReplyGate,
  type BotAllowance,
  type ReplyCheckpoint,
  type ReplyDecision,
  type ReplyGate,
} from "@/modules/bot/reply-gate";
export type { ContextLimits } from "@/modules/bot/context";
export type {
  Model,
  ModelMessage,
  ModelRequest,
  ModelResponse,
  ModelTool,
  ModelToolCall,
  ModelToolOutput,
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
  scheduleAllows,
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
  createBotAllowance,
  recordBotReplyUsage,
  monthlyReplyLimit,
  replyWarningThreshold,
  type ReplyAllowance,
  type ReplyUsage,
} from "@/modules/bot/allowance";
export {
  createBotSandbox,
  sandboxDailyCap,
  sandboxInputSchema,
  type BotSandbox,
  type SandboxContact,
  type SandboxMessage,
} from "@/modules/bot/sandbox";
