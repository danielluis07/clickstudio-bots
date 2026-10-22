import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "@/db/database";
import {
  channel,
  contact,
  conversation,
  inboxEvent,
  member,
  message,
  organization,
  user,
} from "@/db/schema";
import { createChannelService } from "@/modules/channels";
import { createConversationRepository } from "@/modules/conversations";
import { resolveTenantScope, type TenantScope } from "@/modules/tenancy";
import { createWebhookInbox } from "@/modules/webhook-inbox";
import { createTestClock } from "@/test/support/clock";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";
import { createTestJobQueue, type TestJobQueue } from "@/test/support/job-queue";
import { createTestNotifier, type TestNotifier } from "@/test/support/notifier";
import {
  contactSyncChange,
  historyChange,
  historyDeclinedChange,
  messageEchoChange,
  metaAppSecret,
  metaDelivery,
  signMetaDelivery,
  textMessageChange,
} from "@/test/support/meta-webhook";

let db: Database;
let tenantA: TenantScope;
let tenantB: TenantScope;
let queue: TestJobQueue;
let notifier: TestNotifier;
let inbox: ReturnType<typeof createWebhookInbox>;
const clock = createTestClock(new Date("2026-10-20T12:00:00Z"));

const business = "5511999990000";
const ana = "5511900000001";
const bruno = "5511900000002";

const receive = (body: string) => inbox.receive({ body, signature: signMetaDelivery(body) });

// Delivers every enqueued job, as QStash would.
const runJobs = async () => {
  for (const job of queue.take()) await inbox.process(job.inboxEventId);
};

const deliverAll = async (changes: { field: string; value: unknown }[]) => {
  for (const change of changes) {
    await receive(metaDelivery(change));
    await runJobs();
  }
};

const conversationsOf = async (scope: TenantScope) => {
  const repository = createConversationRepository(db, scope);
  return Promise.all(
    (await repository.listConversations()).conversations.map(
      async ({ contact, lastMessageAt, id }) => ({
        contact: {
          phone: contact.phone,
          profileName: contact.profileName,
          appName: contact.appName,
          name: contact.name,
        },
        lastMessageAt,
        messages: (await repository.listMessages(id))!.messages.map(
          ({ wamid, direction, origin, status, text, sentAt, imported }) => ({
            wamid,
            direction,
            origin,
            status,
            text,
            sentAt,
            imported,
          }),
        ),
      }),
    ),
  );
};

const channelSummaryOf = (scope: TenantScope) =>
  createChannelService({
    db,
    clock,
    getWhatsApp() {
      throw new Error("unused");
    },
  }).getChannel(scope);

// Meta shares the last 180 days in three phases, each in chunks that may
// arrive in any order and more than once.
const phase0 = historyChange({
  phoneNumberId: "300",
  phase: 0,
  chunkOrder: 1,
  progress: 30,
  threads: [
    {
      id: ana,
      messages: [
        { wamid: "wamid.H-A3", from: ana, timestamp: "1792411200", body: "Vocês entregam amanhã?" },
        {
          wamid: "wamid.H-A4",
          from: business,
          timestamp: "1792414800",
          body: "Entregamos sim.",
          status: "READ",
        },
      ],
    },
  ],
});
const phase1First = historyChange({
  phoneNumberId: "300",
  phase: 1,
  chunkOrder: 1,
  progress: 60,
  threads: [
    {
      id: ana,
      messages: [
        {
          wamid: "wamid.H-A2",
          from: business,
          timestamp: "1789822800",
          body: "Pedido confirmado.",
          status: "DELIVERED",
        },
      ],
    },
    {
      id: bruno,
      messages: [
        { wamid: "wamid.H-B1", from: bruno, timestamp: "1789819200", body: "Qual o horário?" },
      ],
    },
  ],
});
const phase1Second = historyChange({
  phoneNumberId: "300",
  phase: 1,
  chunkOrder: 2,
  progress: 80,
  threads: [
    {
      id: ana,
      messages: [
        { wamid: "wamid.H-A1", from: ana, timestamp: "1789819200", body: "Quero fazer um pedido" },
        // Media is not imported; its content is not shared in history anyway.
        { wamid: "wamid.H-MEDIA", from: ana, timestamp: "1789820000", type: "media_placeholder" },
      ],
    },
  ],
});
const phase2 = historyChange({
  phoneNumberId: "300",
  phase: 2,
  chunkOrder: 1,
  progress: 100,
  threads: [
    {
      id: bruno,
      messages: [
        { wamid: "wamid.H-B0", from: bruno, timestamp: "1784635200", body: "Primeiro contato" },
      ],
    },
  ],
});

const imported = (
  wamid: string,
  from: "contact" | "app",
  text: string,
  sentAt: string,
  status: "delivered" | "read" | null = null,
) => ({
  wamid,
  direction: from === "contact" ? ("inbound" as const) : ("outbound" as const),
  origin: from,
  status,
  text,
  sentAt: new Date(sentAt),
  imported: true,
});

const importedConversations = [
  {
    contact: { phone: ana, profileName: null, appName: null, name: null },
    lastMessageAt: new Date("2026-10-19T13:00:00Z"),
    messages: [
      imported("wamid.H-A1", "contact", "Quero fazer um pedido", "2026-09-19T12:00:00Z"),
      imported("wamid.H-A2", "app", "Pedido confirmado.", "2026-09-19T13:00:00Z", "delivered"),
      imported("wamid.H-A3", "contact", "Vocês entregam amanhã?", "2026-10-19T12:00:00Z"),
      imported("wamid.H-A4", "app", "Entregamos sim.", "2026-10-19T13:00:00Z", "read"),
    ],
  },
  {
    contact: { phone: bruno, profileName: null, appName: null, name: null },
    lastMessageAt: new Date("2026-09-19T12:00:00Z"),
    messages: [
      imported("wamid.H-B0", "contact", "Primeiro contato", "2026-07-21T12:00:00Z"),
      imported("wamid.H-B1", "contact", "Qual o horário?", "2026-09-19T12:00:00Z"),
    ],
  },
];

afterAll(() => closeTestDatabase(db));

beforeAll(async () => {
  db = await createTestDatabase();
  await db.insert(user).values([
    { id: "owner-a", name: "Owner A", email: "a@example.com" },
    { id: "owner-b", name: "Owner B", email: "b@example.com" },
  ]);
  await db.insert(organization).values([
    { id: "tenant-a", name: "Tenant A", slug: "a" },
    { id: "tenant-b", name: "Tenant B", slug: "b" },
  ]);
  await db.insert(member).values([
    { organizationId: "tenant-a", userId: "owner-a", role: "owner" },
    { organizationId: "tenant-b", userId: "owner-b", role: "owner" },
  ]);
  tenantA = (await resolveTenantScope(db, { userId: "owner-a" }))!;
  tenantB = (await resolveTenantScope(db, { userId: "owner-b" }))!;
});

beforeEach(async () => {
  await db.delete(message);
  await db.delete(conversation);
  await db.delete(contact);
  await db.delete(inboxEvent);
  await db.delete(channel);
  const credential = { keyVersion: "v1", iv: "", ciphertext: "", tag: "" };
  await db.insert(channel).values([
    {
      id: "channel-a",
      tenantId: "tenant-a",
      wabaId: "200",
      phoneNumberId: "300",
      displayPhoneNumber: "+55 11 99999-0000",
      credential,
      subscriptionFields: [],
      historySync: "requested",
      createdAt: clock.now(),
    },
    {
      id: "channel-b",
      tenantId: "tenant-b",
      wabaId: "201",
      phoneNumberId: "301",
      displayPhoneNumber: "+55 11 99999-0001",
      credential,
      subscriptionFields: [],
      historySync: "requested",
      createdAt: clock.now(),
    },
  ]);
  queue = createTestJobQueue();
  notifier = createTestNotifier();
  inbox = createWebhookInbox({ db, clock, queue, notifier, appSecret: metaAppSecret });
});

describe("History import", () => {
  test("phased, duplicated and out-of-order history chunks produce the same Conversations", async () => {
    await deliverAll([phase0, phase1First, phase1Second, phase2]);
    expect(await conversationsOf(tenantA)).toEqual(importedConversations);

    for (const table of [message, conversation, contact, inboxEvent]) await db.delete(table);
    await deliverAll([phase2, phase1Second, phase0, phase1First]);
    // Redelivered, alone and inside another batch.
    await receive(metaDelivery(phase1Second, phase0));
    await runJobs();
    await deliverAll([phase1First]);

    expect(await conversationsOf(tenantA)).toEqual(importedConversations);
    expect(await conversationsOf(tenantB)).toEqual([]);
  });

  test("imported messages enqueue nothing, so they never start a Bot turn", async () => {
    await receive(metaDelivery(phase0, phase1First));
    expect(queue.jobs.every(({ type }) => type === "process-inbox-event")).toBe(true);
    await runJobs();

    expect(queue.jobs).toEqual([]);
    const conversations = await conversationsOf(tenantA);
    expect(conversations.flatMap(({ messages }) => messages).every((found) => found.imported)).toBe(
      true,
    );
    // Members' open inboxes refresh to show the imported Conversations.
    expect(
      new Set(notifier.pings.map(({ ping }) => "conversationId" in ping && ping.conversationId))
        .size,
    ).toBe(2);
  });

  test("a message received live and again in history keeps its live record", async () => {
    await deliverAll([
      textMessageChange({
        phoneNumberId: "300",
        wamid: "wamid.LIVE",
        from: ana,
        name: "Ana",
        body: "Oi",
        timestamp: "1792497600",
      }),
    ]);
    await deliverAll([
      historyChange({
        phoneNumberId: "300",
        threads: [
          {
            id: ana,
            messages: [{ wamid: "wamid.LIVE", from: ana, timestamp: "1792497600", body: "Oi" }],
          },
        ],
      }),
    ]);

    const [found] = await conversationsOf(tenantA);
    expect(found.contact.profileName).toBe("Ana");
    expect(found.messages).toEqual([
      {
        wamid: "wamid.LIVE",
        direction: "inbound",
        origin: "contact",
        status: null,
        text: "Oi",
        sentAt: new Date("2026-10-20T12:00:00Z"),
        imported: false,
      },
    ]);
  });

  test("declined history, including error 2593109, shows history not imported", async () => {
    expect(await channelSummaryOf(tenantA)).toMatchObject({ historyNotImported: false });
    await deliverAll([historyDeclinedChange({ phoneNumberId: "300" })]);

    expect(await channelSummaryOf(tenantA)).toMatchObject({ historyNotImported: true });
    expect(await channelSummaryOf(tenantB)).toMatchObject({ historyNotImported: false });
    expect(await conversationsOf(tenantA)).toEqual([]);
  });

  test("group messages are ignored, in history and live", async () => {
    await deliverAll([
      historyChange({
        phoneNumberId: "300",
        threads: [
          {
            id: ana,
            messages: [
              {
                wamid: "wamid.H-GROUP",
                from: ana,
                timestamp: "1792411200",
                groupId: "120363000000000001",
              },
            ],
          },
          // Meta leaves groups out of history; a thread not keyed by a wa_id is not a Contact's.
          {
            id: "120363000000000002@g.us",
            messages: [{ wamid: "wamid.H-GROUP-THREAD", from: bruno, timestamp: "1792411200" }],
          },
        ],
      }),
    ]);
    const live = textMessageChange({ phoneNumberId: "300", wamid: "wamid.GROUP", from: bruno });
    const echo = messageEchoChange({ phoneNumberId: "300", wamid: "wamid.GROUP-ECHO", to: bruno });
    await deliverAll([
      {
        ...live,
        value: {
          ...live.value,
          messages: [{ ...live.value.messages[0], group_id: "120363000000000001" }],
        },
      },
      {
        ...echo,
        value: {
          ...echo.value,
          message_echoes: [{ ...echo.value.message_echoes[0], group_id: "120363000000000001" }],
        },
      },
    ]);

    expect(await conversationsOf(tenantA)).toEqual([]);
    expect(notifier.pings).toEqual([]);
  });
});

describe("Contacts sync", () => {
  test("names saved in the WhatsApp Business app update Contacts without duplicating them", async () => {
    await deliverAll([
      textMessageChange({ phoneNumberId: "300", wamid: "wamid.ANA", from: ana, name: "Aninha" }),
    ]);
    await deliverAll([
      historyChange({
        phoneNumberId: "300",
        threads: [
          {
            id: bruno,
            messages: [
              {
                wamid: "wamid.H-B1",
                from: bruno,
                timestamp: "1789819200",
                body: "Qual o horário?",
              },
            ],
          },
        ],
      }),
    ]);
    await deliverAll([
      contactSyncChange({
        phoneNumberId: "300",
        contacts: [
          { phone: ana, fullName: "Ana Souza" },
          { phone: bruno, fullName: "Bruno Lima" },
        ],
      }),
    ]);

    const contacts = (await conversationsOf(tenantA)).map(({ contact }) => contact);
    expect(contacts).toEqual([
      { phone: ana, profileName: "Aninha", appName: "Ana Souza", name: null },
      { phone: bruno, profileName: null, appName: "Bruno Lima", name: null },
    ]);
    expect(await conversationsOf(tenantB)).toEqual([]);
  });

  test("app contacts who never wrote to the business are not stored", async () => {
    const carla = "5511900000003";
    await deliverAll([
      contactSyncChange({
        phoneNumberId: "300",
        contacts: [{ phone: carla, fullName: "Carla Dias" }],
      }),
    ]);
    expect(notifier.pings).toEqual([]);

    await deliverAll([
      textMessageChange({ phoneNumberId: "300", wamid: "wamid.CARLA", from: carla, name: "Carla" }),
    ]);
    expect((await conversationsOf(tenantA))[0].contact).toEqual({
      phone: carla,
      profileName: "Carla",
      appName: null,
      name: null,
    });
  });

  test("a later app edit or removal wins, whichever order the events arrive in", async () => {
    await deliverAll([
      textMessageChange({ phoneNumberId: "300", wamid: "wamid.ANA", from: ana, name: "Aninha" }),
    ]);
    await deliverAll([
      contactSyncChange({
        phoneNumberId: "300",
        contacts: [{ phone: ana, fullName: "Ana Souza Lima", timestamp: "1792497700" }],
      }),
      contactSyncChange({
        phoneNumberId: "300",
        contacts: [{ phone: ana, fullName: "Ana Souza", timestamp: "1792497600" }],
      }),
    ]);
    expect((await conversationsOf(tenantA))[0].contact.appName).toBe("Ana Souza Lima");

    await deliverAll([
      contactSyncChange({
        phoneNumberId: "300",
        contacts: [{ phone: ana, action: "remove", timestamp: "1792497800" }],
      }),
    ]);
    expect((await conversationsOf(tenantA))[0].contact).toEqual({
      phone: ana,
      profileName: "Aninha",
      appName: null,
      name: null,
    });
  });

  test("a name a Member gave in the dashboard is never overwritten", async () => {
    await deliverAll([
      textMessageChange({ phoneNumberId: "300", wamid: "wamid.ANA", from: ana, name: "Aninha" }),
    ]);
    const [
      {
        contact: { id },
      },
    ] = (await createConversationRepository(db, tenantA).listConversations()).conversations;
    await createConversationRepository(db, tenantA).updateContactDetails(id, {
      name: "Ana (cliente VIP)",
      email: null,
      city: null,
      need: null,
    });
    await deliverAll([
      contactSyncChange({
        phoneNumberId: "300",
        contacts: [{ phone: ana, fullName: "Ana Souza" }],
      }),
    ]);

    expect((await conversationsOf(tenantA))[0].contact).toEqual({
      phone: ana,
      profileName: "Aninha",
      appName: "Ana Souza",
      name: "Ana (cliente VIP)",
    });
  });
});
