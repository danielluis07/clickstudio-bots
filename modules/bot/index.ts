// The Bot core: one turn decides a grounded answer or a Handoff, behind the
// Model and repository ports. Live turns record their outcome and tokens.
export { createBotActivation, type BotActivation } from "@/modules/bot/activation";
export { readBotConfiguration, type BotConfiguration } from "@/modules/bot/configuration";
export {
  createLinkSettingsEditor,
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
  type CaptureMode,
  type CaptureSettings,
} from "@/modules/bot/capture";
export {
  botTurnAttempts,
  burstWait,
  createLiveBot,
  type LiveBot,
  type BotJob,
  type BotJobQueue,
  type BurstWait,
} from "@/modules/bot/live";
export {
  createReplyGate,
  type BotAllowance,
  type ReplyCheckpoint,
  type ReplyDecision,
  type ReplyGate,
} from "@/modules/bot/reply-gate";
export { liveTurnContext, type ContextLimits } from "@/modules/bot/context";
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
  BotSettings,
  BusinessProfile,
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
  readBotSettings,
  type BotSettingsLimits,
} from "@/modules/bot/settings";
export type { HandoffReason } from "@/modules/bot/tools";
export {
  createBotCore,
  splitTokens,
  type BotCore,
  type TurnDecision,
  type TurnOutcome,
  type TurnTokens,
} from "@/modules/bot/turn";
export {
  alertBotHandoffSpikes,
  pruneBotTurnRecords,
  type BotTurnRecord,
} from "@/modules/bot/turn-records";
export {
  createBotAllowance,
  recordBotReplyUsage,
  monthlyReplyLimit,
  replyWarningThreshold,
  type ReplyAllowance,
  type ReplyUsage,
} from "@/modules/bot/allowance";
export { contactCapDayStart, dailyContactReplyLimit } from "@/modules/bot/contact-cap";
export { ReservationRaceError } from "@/modules/bot/reservation-race";
export {
  createBotSandbox,
  sandboxDailyCap,
  sandboxInputSchema,
  type BotSandbox,
  type SandboxContact,
  type SandboxMessage,
} from "@/modules/bot/sandbox";
