import type { QueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import type { ClientOptions, TokenRequest } from "ably";
import type { InboxPing } from "@/platform/notifier";
import type { useTRPC } from "@/trpc/client";

// Pings are hints. All Contact/message data comes back through the existing
// authenticated queries, including the search and pagination variants.
export const invalidateInbox = (
  queryClient: QueryClient,
  trpc: ReturnType<typeof useTRPC>,
  ping?: InboxPing,
) => {
  const filters = [trpc.conversations.list.pathFilter()];
  if (ping && "conversationId" in ping) {
    filters.push(
      trpc.conversations.get.queryFilter({ conversationId: ping.conversationId }),
      trpc.conversations.messages.infiniteQueryFilter({ conversationId: ping.conversationId }),
      trpc.conversations.handoffs.queryFilter({ conversationId: ping.conversationId }),
    );
  } else {
    filters.push(trpc.conversations.get.pathFilter());
    if (!ping)
      filters.push(
        trpc.conversations.messages.pathFilter(),
        trpc.conversations.handoffs.pathFilter(),
      );
  }
  return Promise.all(filters.map((filter) => queryClient.invalidateQueries(filter)));
};

// The small portion of the browser SDK used here, also implemented by the
// fake connection in tests. No application data travels over this interface.
type RealtimeClient = {
  channels: {
    get(name: string): {
      subscribe(name: string, listener: (message: { data?: unknown }) => void): Promise<unknown>;
      unsubscribe(name: string, listener: (message: { data?: unknown }) => void): void;
      on(event: "attached" | "update", listener: () => void): void;
      off(event: "attached" | "update", listener: () => void): void;
    };
  };
  close(): void;
};

// The single identifier a ping may carry, or null for anything else.
const readId = (data: unknown, key: string) =>
  data &&
  typeof data === "object" &&
  Object.keys(data).length === 1 &&
  key in data &&
  typeof (data as Record<string, unknown>)[key] === "string" &&
  (data as Record<string, string>)[key].length > 0
    ? (data as Record<string, string>)[key]
    : null;

// Listens for one event on one channel. `catchUp` runs on every attachment:
// the first (after the initial reads) and recovery after a disconnect or a
// loss of message continuity. Cleanup closes the connection.
const subscribe = (
  client: RealtimeClient,
  channelName: string,
  {
    event,
    receive,
    catchUp,
    label,
  }: {
    event: string;
    receive: (data: unknown) => void;
    catchUp: () => void;
    label: string;
  },
) => {
  const channel = client.channels.get(channelName);
  let active = true;
  const listener = ({ data }: { data?: unknown }) => {
    if (active) receive(data);
  };
  const attached = () => {
    if (active) catchUp();
  };
  channel.on("attached", attached);
  channel.on("update", attached);
  void channel.subscribe(event, listener).catch(() => {
    if (active) console.error(`${label} subscription failed`);
  });
  return () => {
    active = false;
    channel.unsubscribe(event, listener);
    channel.off("attached", attached);
    channel.off("update", attached);
    client.close();
  };
};

export const subscribeToInbox = (
  client: RealtimeClient,
  channelName: string,
  invalidate: (ping?: InboxPing) => void,
) =>
  subscribe(client, channelName, {
    event: "invalidate",
    label: "Inbox",
    receive: (data) => {
      const conversationId = readId(data, "conversationId");
      const contactId = readId(data, "contactId");
      if (conversationId) invalidate({ conversationId });
      else if (contactId) invalidate({ contactId });
    },
    catchUp: () => invalidate(),
  });

// `refresh` gets the new Alert's id, or nothing after a (re)attachment.
export const subscribeToAlerts = (
  client: RealtimeClient,
  channelName: string,
  refresh: (alertId?: string) => void,
) =>
  subscribe(client, channelName, {
    event: "alert",
    label: "Alerts",
    receive: (data) => {
      const alertId = readId(data, "alertId");
      if (alertId) refresh(alertId);
    },
    catchUp: () => refresh(),
  });

type RealtimeClientOptions = Pick<ClientOptions, "autoConnect" | "authCallback">;
type RealtimeClientFactory = (
  options: RealtimeClientOptions,
) => RealtimeClient & { connect(): void };

const loadAblyClient = async (): Promise<RealtimeClientFactory> => {
  const { Realtime } = await import("ably");
  return (options) => new Realtime(options);
};

// Opens one connection on the channel `channelOf` picks from the token
// procedure's answer, retrying transient startup failures every five seconds.
const startRealtime = <Access extends { tokenRequest: TokenRequest }>({
  issueToken,
  channelOf,
  open,
  label,
  loadClient = loadAblyClient,
}: {
  issueToken: () => Promise<Access>;
  channelOf: (access: Access) => string;
  open: (client: RealtimeClient, channelName: string) => () => void;
  label: string;
  loadClient?: () => Promise<RealtimeClientFactory>;
}) => {
  let disposed = false;
  let stop: (() => void) | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const start = async () => {
    try {
      const [createClient, access] = await Promise.all([loadClient(), issueToken()]);
      if (disposed) return;
      let initial = true;
      const client = createClient({
        autoConnect: false,
        authCallback: (_params, callback) => {
          if (initial) {
            initial = false;
            callback(null, access.tokenRequest);
            return;
          }
          // Renewal rechecks the session and membership. Never retain the
          // old Tenant's or Member's subscription when authorization changes.
          void issueToken().then(
            (renewed) => {
              if (disposed || channelOf(renewed) !== channelOf(access)) {
                stop?.();
                callback(`${label} authorization changed`, null);
                return;
              }
              callback(null, renewed.tokenRequest);
            },
            () => callback(`${label} authorization failed`, null),
          );
        },
      });
      stop = open(client, channelOf(access));
      client.connect();
    } catch (error) {
      if (disposed) return;
      stop?.();
      stop = undefined;
      console.error(`${label} realtime unavailable`);
      // Disabled realtime and authorization refusals need no retry. Network,
      // server and chunk-loading failures recover while the page stays open.
      if (
        error instanceof TRPCClientError &&
        ["UNAUTHORIZED", "FORBIDDEN", "PRECONDITION_FAILED"].includes(error.data?.code)
      )
        return;
      retryTimer = setTimeout(() => {
        void start();
      }, 5000);
    }
  };
  void start();
  return () => {
    disposed = true;
    clearTimeout(retryTimer);
    stop?.();
  };
};

export const startInboxRealtime = ({
  issueToken,
  invalidate,
  loadClient,
}: {
  issueToken: () => Promise<{ channel: string; tokenRequest: TokenRequest }>;
  invalidate: (ping?: InboxPing) => void;
  loadClient?: () => Promise<RealtimeClientFactory>;
}) =>
  startRealtime({
    issueToken,
    channelOf: (access) => access.channel,
    open: (client, channelName) => subscribeToInbox(client, channelName, invalidate),
    label: "Inbox",
    loadClient,
  });

// The Member's own Alerts, on every dashboard page.
export const startAlertsRealtime = ({
  issueToken,
  refresh,
  loadClient,
}: {
  issueToken: () => Promise<{ alertsChannel: string; tokenRequest: TokenRequest }>;
  refresh: (alertId?: string) => void;
  loadClient?: () => Promise<RealtimeClientFactory>;
}) =>
  startRealtime({
    issueToken,
    channelOf: (access) => access.alertsChannel,
    open: (client, channelName) => subscribeToAlerts(client, channelName, refresh),
    label: "Alerts",
    loadClient,
  });
