import type { InboxPing, Notifier } from "@/platform/notifier";

export const createTestNotifier = () => {
  const pings: { tenantId: string; ping: InboxPing }[] = [];
  let shouldFail = false;
  return {
    pings,
    failNext: () => { shouldFail = true; },
    async publish(tenantId, ping) {
      if (shouldFail) {
        shouldFail = false;
        throw new Error("Notifier unavailable");
      }
      pings.push({ tenantId, ping });
    },
  } satisfies Notifier & { pings: unknown; failNext: unknown };
};

export type TestNotifier = ReturnType<typeof createTestNotifier>;
