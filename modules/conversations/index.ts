// Contacts, their Conversations with a Tenant on one Channel, and the
// messages in them.
export { recordInboundTextMessage, type InboundTextMessage } from "@/modules/conversations/inbound";
export { createConversationRepository, type ConversationDetails, type ConversationMessage } from "@/modules/conversations/repository";
export { contactDetailsSchema, type ContactDetails } from "@/modules/conversations/contact-details";
