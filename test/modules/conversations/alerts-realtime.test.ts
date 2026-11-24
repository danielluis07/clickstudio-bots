import { expect, test } from "bun:test";
import {
  alertBellLabel,
  startAlertsRealtime,
  subscribeToAlerts,
} from "@/modules/conversations/hooks";

const tokenRequest = {
  keyName: "test.key",
  timestamp: 1,
  nonce: "test",
  mac: "signed",
  capability: "{}",
};
const access = {
  channel: "tenant:tenant-a:inbox",
  alertsChannel: "tenant:tenant-a:member:member-a:alerts",
  tokenRequest,
};

// A fake connection to Ably's browser SDK that records what it is asked.
const createFakeClient = () => {
  const fake = {
    channel: "",
    deliver: undefined as ((message: { data?: unknown }) => void) | undefined,
    states: new Map<string, () => void>(),
    closed: false,
    connected: false,
  };
  const client = {
    channels: {
      get: (name: string) => {
        fake.channel = name;
        return {
          subscribe: async (_event: string, listener: (message: { data?: unknown }) => void) => {
            fake.deliver = listener;
          },
          unsubscribe: () => {
            fake.deliver = undefined;
          },
          on: (event: string, listener: () => void) => {
            fake.states.set(event, listener);
          },
          off: (event: string) => {
            fake.states.delete(event);
          },
        };
      },
    },
    connect: () => {
      fake.connected = true;
    },
    close: () => {
      fake.closed = true;
    },
  };
  return { fake, client };
};

test("the Alerts subscription accepts Alert ids only, catches up on attachment, and closes on cleanup", () => {
  const { fake, client } = createFakeClient();
  const received: (string | undefined)[] = [];
  const stop = subscribeToAlerts(client, access.alertsChannel, (alertId) => {
    received.push(alertId);
  });
  expect(fake.channel).toBe(access.alertsChannel);

  fake.deliver!({ data: { alertId: "alert-a" } });
  for (const data of [
    null,
    {},
    { alertId: "" },
    { alertId: "a", text: "private" },
    { conversationId: "c" },
  ])
    fake.deliver!({ data });
  fake.states.get("attached")!();
  fake.states.get("update")!();
  expect(received).toEqual(["alert-a", undefined, undefined]);

  const lateMessage = fake.deliver!;
  stop();
  lateMessage({ data: { alertId: "late" } });
  expect(received).toHaveLength(3);
  expect(fake.states.size).toBe(0);
  expect(fake.closed).toBe(true);
});

test("the dashboard subscribes to the Member's own Alerts channel and drops it when renewal names another", async () => {
  const { fake, client } = createFakeClient();
  let authCallback:
    ((params: unknown, callback: (error: unknown, token: unknown) => void) => void) | undefined;
  let renewed = access;
  const stop = startAlertsRealtime({
    issueToken: async () => renewed,
    loadClient: async () => (options) => {
      authCallback = options.authCallback as typeof authCallback;
      return client;
    },
    refresh: () => {},
  });
  try {
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fake.connected).toBe(true);
    expect(fake.channel).toBe(access.alertsChannel);

    const first = await new Promise((resolve) =>
      authCallback!({}, (_error, token) => resolve(token)),
    );
    expect(first).toEqual(tokenRequest);

    renewed = { ...access, alertsChannel: "tenant:tenant-a:member:member-b:alerts" };
    const error = await new Promise((resolve) => authCallback!({}, (failure) => resolve(failure)));
    expect(error).toBeString();
    expect(fake.closed).toBe(true);
  } finally {
    stop();
  }
});

test("the bell's name says how many Alerts are unread, in the singular for one", () => {
  expect([0, 1, 3].map(alertBellLabel)).toEqual([
    "Alertas",
    "Alertas, 1 não lido",
    "Alertas, 3 não lidos",
  ]);
});
