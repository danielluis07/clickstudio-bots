export {
  findChannelCredential,
  recordHistoryDeclined,
  resolveChannelPhoneNumber,
  resolveChannelWaba,
  type ChannelRoute,
} from "@/modules/channels/repository";
export {
  createChannelService,
  type ChannelSignup,
  type ChannelSummary,
} from "@/modules/channels/service";
export type { WhatsAppGateway } from "@/modules/channels/whatsapp-gateway";
export {
  activateChannelBot,
  readChannelBotState,
  setChannelBotPaused,
} from "@/modules/channels/bot-controls";
export {
  recordAccountUpdate,
  recordCredentialRejected,
  sweepChannelHealth,
  channelSignal,
  type AccountUpdate,
  type ChannelSignal,
} from "@/modules/channels/health";
