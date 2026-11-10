// The Meta webhook inbox (ADR 0002): signed deliveries stored once per event,
// enqueued for processing, and processed into Contacts and Conversations.
export type { Job, JobQueue } from "@/modules/webhook-inbox/job-queue";
export {
  autoRetryDelaysMs,
  createWebhookInbox,
  staleQueueAfterMs,
  type WebhookInbox,
} from "@/modules/webhook-inbox/service";
export { answerSubscriptionChallenge } from "@/modules/webhook-inbox/signature";
export { pruneInboxEvents } from "@/modules/webhook-inbox/retention";
export type { InboxDiagnostics } from "@/modules/webhook-inbox/diagnostics";
