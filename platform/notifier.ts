import { logError } from "@/platform/diagnostics";

// Realtime carries only identifiers. Readers still authorize and refetch
// through the application; a ping never contains Contact or message data.
export type InboxPing = { conversationId: string } | { contactId: string };

export type Notifier = {
  publish(tenantId: string, ping: InboxPing): Promise<void>;
};

// An interactive write has already succeeded. A notification failure must
// not invite the Member to repeat a send or undo a successful rename.
export const notifyInbox = async (notifier: Notifier, tenantId: string, ping: InboxPing) => {
  try {
    await notifier.publish(tenantId, ping);
  } catch (error) {
    logError("notification_failed", error, {
      tenantId,
      conversationId: "conversationId" in ping ? ping.conversationId : undefined,
    });
  }
};
