import { expect, test } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { createTRPCClient, httpLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import superjson from "superjson";
import { invalidateInbox, startInboxRealtime, subscribeToInbox } from "@/modules/conversations/hooks";
import type { AppRouter } from "@/trpc/routers/_app";

const realtimeAccess = {
  channel: "tenant:tenant-a:inbox",
  tokenRequest: { keyName: "test.key", timestamp: 1, nonce: "test", mac: "signed", capability: '{"tenant:tenant-a:inbox":["subscribe"]}' },
};

test("an inbound ping refetches the open Conversation and inbox through their existing queries", async () => {
  const queryClient = new QueryClient();
  const trpc = createTRPCOptionsProxy<AppRouter>({
    queryClient,
    client: createTRPCClient<AppRouter>({ links: [httpLink({ url: "/api/trpc", transformer: superjson })] }),
  });
  let stored = ["Olá"];
  const messages = new QueryObserver(queryClient, {
    queryKey: trpc.conversations.messages.infiniteQueryKey({ conversationId: "conversation-a" }),
    queryFn: async () => stored,
    staleTime: Infinity,
  });
  let inboxReads = 0;
  const inbox = new QueryObserver(queryClient, {
    queryKey: trpc.conversations.list.infiniteQueryKey({ search: "" }),
    queryFn: async () => ++inboxReads,
    staleTime: Infinity,
  });
  const stopMessages = messages.subscribe(() => {});
  const stopInbox = inbox.subscribe(() => {});
  await Promise.all([messages.refetch(), inbox.refetch()]);
  const otherKey = trpc.conversations.messages.infiniteQueryKey({ conversationId: "conversation-b" });
  queryClient.setQueryData(otherKey, { pages: [{ messages: [], nextCursor: null }], pageParams: [null] });
  const readsBefore = inboxReads;

  stored = ["Olá", "Nova mensagem"];
  await invalidateInbox(queryClient, trpc, { conversationId: "conversation-a" });

  expect(messages.getCurrentResult().data).toEqual(["Olá", "Nova mensagem"]);
  expect(inboxReads).toBe(readsBefore + 1);
  expect(queryClient.getQueryState(otherKey)?.isInvalidated).toBe(false);
  stopMessages();
  stopInbox();
  queryClient.clear();
});

test("the subscription accepts IDs only, catches up on attachment, and closes on cleanup", async () => {
  let deliver: ((message: { data?: unknown }) => void) | undefined;
  const states = new Map<string, () => void>();
  let closed = false;
  let subscribedChannel = "";
  const received: unknown[] = [];
  const client = {
    channels: {
      get: (name: string) => {
        subscribedChannel = name;
        return {
          subscribe: async (_name: string, listener: (message: { data?: unknown }) => void) => { deliver = listener; },
          unsubscribe: () => { deliver = undefined; },
          on: (event: string, listener: () => void) => { states.set(event, listener); },
          off: (event: string) => { states.delete(event); },
        };
      },
    },
    close: () => { closed = true; },
  };
  const stop = subscribeToInbox(client, "tenant:tenant-a:inbox", (ping) => { received.push(ping); });
  expect(subscribedChannel).toBe("tenant:tenant-a:inbox");

  deliver!({ data: { conversationId: "conversation-a" } });
  deliver!({ data: { contactId: "contact-a" } });
  for (const data of [null, {}, { conversationId: "" }, { conversationId: "a", text: "private" }, { phone: "55119999" }]) {
    deliver!({ data });
  }
  states.get("attached")!();
  states.get("update")!();
  expect(received).toEqual([{ conversationId: "conversation-a" }, { contactId: "contact-a" }, undefined, undefined]);

  const lateMessage = deliver!;
  stop();
  lateMessage({ data: { conversationId: "late" } });
  expect(received).toHaveLength(4);
  expect(states.size).toBe(0);
  expect(deliver).toBeUndefined();
  expect(closed).toBe(true);
});

test("Contact pings refresh Conversation details, and reconnect invalidates every cached inbox query", async () => {
  const queryClient = new QueryClient();
  const trpc = createTRPCOptionsProxy<AppRouter>({
    queryClient,
    client: createTRPCClient<AppRouter>({ links: [httpLink({ url: "/api/trpc", transformer: superjson })] }),
  });
  const keys = [
    trpc.conversations.list.infiniteQueryKey({ search: "Ana" }),
    trpc.conversations.get.queryKey({ conversationId: "conversation-a" }),
    trpc.conversations.messages.infiniteQueryKey({ conversationId: "conversation-a" }),
  ];
  for (const key of keys) queryClient.setQueryData([...key], {});

  await invalidateInbox(queryClient, trpc, { contactId: "contact-a" });
  expect(keys.map((key) => queryClient.getQueryState(key)?.isInvalidated)).toEqual([true, true, false]);
  await invalidateInbox(queryClient, trpc);
  expect(keys.map((key) => queryClient.getQueryState(key)?.isInvalidated)).toEqual([true, true, true]);
  queryClient.clear();
});

test("a temporary startup failure retries and connects without remounting the inbox", async () => {
  let attempts = 0;
  let closed = false;
  let attachedChannel = "";
  let onConnected: () => void = () => {};
  const connected = new Promise<void>((resolve) => { onConnected = resolve; });
  const stop = startInboxRealtime({
    issueToken: async () => {
      if (++attempts === 1) throw new Error("Temporary network failure");
      return realtimeAccess;
    },
    loadClient: async () => () => ({
      channels: {
        get: (name) => {
          attachedChannel = name;
          return { subscribe: async () => {}, unsubscribe: () => {}, on: () => {}, off: () => {} };
        },
      },
      connect: onConnected,
      close: () => { closed = true; },
    }),
    invalidate: () => {},
  });
  try {
    await connected;
    expect(attempts).toBe(2);
    expect(attachedChannel).toBe("tenant:tenant-a:inbox");
  } finally {
    stop();
  }
  expect(closed).toBe(true);
}, 10_000);

test("unmounting during authorization prevents a late subscription from opening", async () => {
  let authorize: (access: typeof realtimeAccess) => void = () => {};
  const authorization = new Promise<typeof realtimeAccess>((resolve) => { authorize = resolve; });
  let connected = false;
  const stop = startInboxRealtime({
    issueToken: () => authorization,
    loadClient: async () => () => ({
      channels: { get: () => ({ subscribe: async () => {}, unsubscribe: () => {}, on: () => {}, off: () => {} }) },
      connect: () => { connected = true; },
      close: () => {},
    }),
    invalidate: () => {},
  });
  stop();
  authorize(realtimeAccess);
  await authorization;
  await new Promise<void>((resolve) => { queueMicrotask(resolve); });
  expect(connected).toBe(false);
});
