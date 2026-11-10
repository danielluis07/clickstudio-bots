import { logError, type Diagnostic } from "@/platform/diagnostics";

// Realtime carries only identifiers. Readers still authorize and refetch
// through the application; a ping never contains Contact or message data.
export type InboxPing = { conversationId: string } | { contactId: string };

export type Notifier = {
  publish(tenantId: string, ping: InboxPing): Promise<void>;
};

// Best effort: the write it announces has already succeeded, and browsers
// refetch on focus and reconnect. A failure must not invite a Member to repeat
// a send, nor fail a job whose retry would repeat its other effects (#142).
export const notifyInbox = async (
  notifier: Notifier,
  tenantId: string,
  ping: InboxPing,
  log?: (entry: Diagnostic) => void,
) => {
  try {
    await notifier.publish(tenantId, ping);
  } catch (error) {
    logError(
      "notification_failed",
      error,
      {
        tenantId,
        conversationId: "conversationId" in ping ? ping.conversationId : undefined,
      },
      log,
    );
  }
};
