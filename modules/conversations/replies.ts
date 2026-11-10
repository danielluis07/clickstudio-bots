import { z } from "zod";
import type { Database } from "@/db/database";
import { findChannelCredential, recordCredentialRejected } from "@/modules/channels";
import { createConversationRepository } from "@/modules/conversations/repository";
import type { WhatsAppSender } from "@/modules/conversations/whatsapp-sender";
import type { TenantScope } from "@/modules/tenancy";
import type { Clock } from "@/platform/clock";
import { logError } from "@/platform/diagnostics";
import { notifyInbox, type Notifier } from "@/platform/notifier";
import { CredentialRejectedError } from "@/platform/whatsapp-credentials";

// WhatsApp's limit for a text message body.
const replySchema = z.object({
  conversationId: z.string().min(1),
  text: z.string().trim().min(1).max(4096),
});

export type DashboardReply = z.input<typeof replySchema>;

// Members reply to Contacts from the dashboard, only while WhatsApp's service
// window is open. Outside it they continue in the WhatsApp Business app.
export const createReplyService = ({
  db,
  clock,
  notifier,
  getSender,
}: {
  db: Database;
  clock: Clock;
  notifier: Notifier;
  getSender: () => WhatsAppSender;
}) => ({
  async sendReply(scope: TenantScope, input: DashboardReply) {
    const parsed = replySchema.safeParse(input);
    if (!parsed.success) return { ok: false as const, error: "invalid" as const };
    const { conversationId, text } = parsed.data;
    const repository = createConversationRepository(db, scope);
    const found = await repository.getConversation(conversationId);
    if (!found) return { ok: false as const, error: "not_found" as const };
    const now = clock.now();
    if (!found.serviceWindowClosesAt || found.serviceWindowClosesAt <= now) {
      return { ok: false as const, error: "window_closed" as const };
    }
    const channel = await findChannelCredential(db, scope, found.channelId);
    // An unconfigured adapter refuses before anything is stored.
    const sender =
      channel &&
      (await Promise.resolve()
        .then(getSender)
        .catch(() => null));
    if (!channel || !sender) return { ok: false as const, error: "channel_unavailable" as const };

    const { id } = await repository.insertPendingReply(conversationId, { text, sentAt: now });
    await notifyInbox(notifier, scope.tenantId, { conversationId });
    const sent = await Promise.resolve()
      .then(() =>
        sender.sendText({
          tenantId: channel.tenantId,
          wabaId: channel.wabaId,
          phoneNumberId: channel.phoneNumberId,
          credential: channel.credential,
          to: found.contact.phone,
          text,
        }),
      )
      .catch(async (error: unknown) => {
        if (error instanceof CredentialRejectedError)
          await recordCredentialRejected(db, scope, channel.channelId, clock.now()).catch(
            (recordError: unknown) =>
              logError("channel_health_record_failed", recordError, {
                tenantId: scope.tenantId,
              }),
          );
        return null;
      });
    await repository.recordReplySent(id, sent);
    await notifyInbox(notifier, scope.tenantId, { conversationId });
    return sent ? { ok: true as const } : { ok: false as const, error: "send_failed" as const };
  },
});

export type ReplyService = ReturnType<typeof createReplyService>;
