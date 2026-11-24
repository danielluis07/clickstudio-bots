import type { AlertPing, InboxPing, Notifier } from "@/platform/notifier";

export const createTestNotifier = () => {
  const pings: { tenantId: string; ping: InboxPing }[] = [];
  const alerts: { tenantId: string; ping: AlertPing }[] = [];
  let shouldFail = false;
  const failIfAsked = () => {
    if (shouldFail) {
      shouldFail = false;
      throw new Error("Notifier unavailable");
    }
  };
  return {
    pings,
    alerts,
    failNext: () => {
      shouldFail = true;
    },
    async publish(tenantId, ping) {
      failIfAsked();
      pings.push({ tenantId, ping });
    },
    async publishAlert(tenantId, ping) {
      failIfAsked();
      alerts.push({ tenantId, ping });
    },
  } satisfies Notifier & { pings: unknown; alerts: unknown; failNext: unknown };
};

export type TestNotifier = ReturnType<typeof createTestNotifier>;
