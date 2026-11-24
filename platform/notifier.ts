import { logError, type Diagnostic } from "@/platform/diagnostics";

// Realtime carries only identifiers. Readers still authorize and refetch
// through the application; a ping never contains Contact or message data.
export type InboxPing = { conversationId: string } | { contactId: string };

// An Alert raised for one Member, announced on that Member's own channel.
export type AlertPing = { memberId: string; alertId: string };

export type Notifier = {
  publish(tenantId: string, ping: InboxPing): Promise<void>;
  publishAlert(tenantId: string, ping: AlertPing): Promise<void>;
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

// Announces Alerts raised in a transaction that has committed. Best effort,
// like `notifyInbox`: the Alerts are stored, and the bell refetches on
// reconnect and focus.
export const notifyAlerts = async (
  notifier: Notifier,
  tenantId: string,
  pings: readonly AlertPing[],
  log?: (entry: Diagnostic) => void,
) => {
  for (const ping of pings) {
    try {
      await notifier.publishAlert(tenantId, ping);
    } catch (error) {
      logError("notification_failed", error, { tenantId }, log);
    }
  }
};
