// Contacts, their Conversations with a Tenant on one Channel, and the
// messages in them.
export {
  createConversationBotRepository,
  resolveBotConversation,
  listBotRecoveryCandidates,
} from "@/modules/conversations/bot-turns";
export { deleteContact } from "@/modules/conversations/contact-deletion";
export { recordAppContact, renameContact, type AppContact } from "@/modules/conversations/contacts";
export { recordMessageChange, type MessageChange } from "@/modules/conversations/changes";
export {
  recordMessageEcho,
  recordBotReplySent,
  type EchoClassification,
  type MessageEcho,
} from "@/modules/conversations/echoes";
export {
  createHandoffControls,
  type ConversationHandoffReason,
  type HandoffControls,
} from "@/modules/conversations/handoff";
export { recordImportedHistory, type ImportedHistory } from "@/modules/conversations/history";
export { recordInboundTextMessage, type InboundTextMessage } from "@/modules/conversations/inbound";
export {
  createReplyService,
  type DashboardReply,
  type ReplyService,
} from "@/modules/conversations/replies";
export { createConversationRepository } from "@/modules/conversations/repository";
export { recordMessageStatus, type MessageStatusUpdate } from "@/modules/conversations/statuses";
export type { WhatsAppSender } from "@/modules/conversations/whatsapp-sender";
