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
    );
  } else {
    filters.push(trpc.conversations.get.pathFilter());
    if (!ping) filters.push(trpc.conversations.messages.pathFilter());
  }
  return Promise.all(filters.map((filter) => queryClient.invalidateQueries(filter)));
};

// The small portion of the browser SDK used here, also implemented by the
// fake connection in tests. No application data travels over this interface.
type InboxRealtimeClient = {
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

export const subscribeToInbox = (
  client: InboxRealtimeClient,
  channelName: string,
  invalidate: (ping?: InboxPing) => void,
) => {
  const channel = client.channels.get(channelName);
  let active = true;
  const receive = ({ data }: { data?: unknown }) => {
    if (!active || !data || typeof data !== "object" || Object.keys(data).length !== 1) return;
    if (
      "conversationId" in data &&
      typeof data.conversationId === "string" &&
      data.conversationId.length > 0
    ) {
      invalidate({ conversationId: data.conversationId });
    } else if (
      "contactId" in data &&
      typeof data.contactId === "string" &&
      data.contactId.length > 0
    ) {
      invalidate({ contactId: data.contactId });
    }
  };
  // Includes the first attachment (after the initial reads) and recovery
  // after a disconnect or a loss of message continuity.
  const catchUp = () => {
    if (active) invalidate();
  };
  channel.on("attached", catchUp);
  channel.on("update", catchUp);
  void channel.subscribe("invalidate", receive).catch(() => {
    if (active) console.error("Inbox subscription failed");
  });
  return () => {
    active = false;
    channel.unsubscribe("invalidate", receive);
    channel.off("attached", catchUp);
    channel.off("update", catchUp);
    client.close();
  };
};

type InboxClientOptions = Pick<ClientOptions, "autoConnect" | "authCallback">;
type InboxClientFactory = (
  options: InboxClientOptions,
) => InboxRealtimeClient & { connect(): void };

const loadAblyClient = async (): Promise<InboxClientFactory> => {
  const { Realtime } = await import("ably");
  return (options) => new Realtime(options);
};

export const startInboxRealtime = ({
  issueToken,
  invalidate,
  loadClient = loadAblyClient,
}: {
  issueToken: () => Promise<{ channel: string; tokenRequest: TokenRequest }>;
  invalidate: (ping?: InboxPing) => void;
  loadClient?: () => Promise<InboxClientFactory>;
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
          // old Tenant's subscription when authorization changes.
          void issueToken().then(
            (renewed) => {
              if (disposed || renewed.channel !== access.channel) {
                stop?.();
                callback("Inbox authorization changed", null);
                return;
              }
              callback(null, renewed.tokenRequest);
            },
            () => callback("Inbox authorization failed", null),
          );
        },
      });
      stop = subscribeToInbox(client, access.channel, invalidate);
      client.connect();
    } catch (error) {
      if (disposed) return;
      stop?.();
      stop = undefined;
      console.error("Inbox realtime unavailable");
      // Disabled realtime and authorization refusals need no retry. Network,
      // server and chunk-loading failures recover while the inbox stays open.
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
