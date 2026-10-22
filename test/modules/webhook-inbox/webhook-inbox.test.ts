import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "@/db/database";
import {
  channel,
  contact,
  conversation,
  inboxEvent,
  member,
  message,
  messageChange,
  organization,
  user,
} from "@/db/schema";
import { createConversationRepository, createReplyService } from "@/modules/conversations";
import { resolveTenantScope, type TenantScope } from "@/modules/tenancy";
import { createWebhookInbox } from "@/modules/webhook-inbox";
import { createTestClock } from "@/test/support/clock";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";
import { createTestJobQueue, type TestJobQueue } from "@/test/support/job-queue";
import { createTestWhatsAppSender } from "@/test/support/whatsapp-sender";
import { createTestNotifier, type TestNotifier } from "@/test/support/notifier";
import {
  messageEchoChange,
  metaAppSecret,
  metaDelivery,
  referencingChange,
  signMetaDelivery,
  statusChange,
  textMessageChange,
} from "@/test/support/meta-webhook";

let db: Database;
let tenantA: TenantScope;
let tenantB: TenantScope;
let queue: TestJobQueue;
let notifier: TestNotifier;
let inbox: ReturnType<typeof createWebhookInbox>;
const clock = createTestClock(new Date("2026-10-20T12:00:00Z"));

const receive = (body: string) => inbox.receive({ body, signature: signMetaDelivery(body) });

// Delivers every enqueued job, as QStash would.
const runJobs = async () => {
  for (const job of queue.take()) await inbox.process(job.inboxEventId);
};

const conversationsOf = async (scope: TenantScope) => {
  const repository = createConversationRepository(db, scope);
  return Promise.all(
    (await repository.listConversations()).conversations.map(
      async ({ id, channelId, contact }) => ({
        id,
        channelId,
        contactPhone: contact.phone,
        contactProfileName: contact.profileName,
        messages: (await repository.listMessages(id))!.messages,
      }),
    ),
  );
};

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
    },
    {
      id: "channel-b",
      tenantId: "tenant-b",
      wabaId: "201",
      phoneNumberId: "301",
      displayPhoneNumber: "+55 11 99999-0001",
      credential,
      subscriptionFields: [],
    },
  ]);
  tenantA = (await resolveTenantScope(db, { userId: "owner-a" }))!;
  tenantB = (await resolveTenantScope(db, { userId: "owner-b" }))!;
});

beforeEach(async () => {
  await db.delete(message);
  await db.delete(messageChange);
  await db.delete(conversation);
  await db.delete(contact);
  await db.delete(inboxEvent);
  queue = createTestJobQueue();
  notifier = createTestNotifier();
  inbox = createWebhookInbox({ db, clock, queue, notifier, appSecret: metaAppSecret });
});

describe("Webhook inbox", () => {
  test("a committed inbound message publishes only its Conversation id to its Tenant", async () => {
    await receive(
      metaDelivery(
        textMessageChange({ phoneNumberId: "300", wamid: "wamid.PING", body: "Conteúdo privado" }),
      ),
    );
    expect(notifier.pings).toEqual([]);
    await runJobs();

    const [found] = await conversationsOf(tenantA);
    expect(notifier.pings).toEqual([{ tenantId: "tenant-a", ping: { conversationId: found.id } }]);
    expect(found.messages[0].text).toBe("Conteúdo privado");
  });

  test("a failed ping is retried without duplicating the committed message", async () => {
    await receive(metaDelivery(textMessageChange({ phoneNumberId: "300", wamid: "wamid.RETRY" })));
    const [job] = queue.take();
    notifier.failNext();
    await expect(inbox.process(job.inboxEventId)).rejects.toThrow("Notifier unavailable");
    expect((await conversationsOf(tenantA))[0].messages).toHaveLength(1);

    expect(await inbox.process(job.inboxEventId)).toEqual({ ok: true, status: "processed" });
    const [found] = await conversationsOf(tenantA);
    expect(found.messages).toHaveLength(1);
    expect(notifier.pings).toEqual([{ tenantId: "tenant-a", ping: { conversationId: found.id } }]);
  });

  test("app replies and their delivery statuses notify only their Conversation's Tenant", async () => {
    await receive(
      metaDelivery(messageEchoChange({ phoneNumberId: "301", wamid: "wamid.APP-PING" })),
    );
    await runJobs();
    const [found] = await conversationsOf(tenantB);
    expect(notifier.pings).toEqual([{ tenantId: "tenant-b", ping: { conversationId: found.id } }]);

    notifier.pings.length = 0;
    await receive(
      metaDelivery(statusChange({ phoneNumberId: "301", wamid: "wamid.APP-PING", status: "read" })),
    );
    const [job] = queue.take();
    notifier.failNext();
    await expect(inbox.process(job.inboxEventId)).rejects.toThrow("Notifier unavailable");
    await inbox.process(job.inboxEventId);
    expect(notifier.pings).toEqual([{ tenantId: "tenant-b", ping: { conversationId: found.id } }]);
    expect((await conversationsOf(tenantB))[0].messages[0].status).toBe("read");
  });

  test("a signed text message becomes one Contact, one Conversation and one message", async () => {
    const delivery = metaDelivery(
      textMessageChange({ phoneNumberId: "300", wamid: "wamid.A1", body: "Olá!" }),
    );

    expect(await receive(delivery)).toEqual({ ok: true });
    await runJobs();

    expect(await conversationsOf(tenantA)).toEqual([
      {
        id: expect.any(String),
        channelId: "channel-a",
        contactPhone: "5511988887777",
        contactProfileName: "Maria Teste",
        messages: [
          {
            id: expect.any(String),
            wamid: "wamid.A1",
            direction: "inbound",
            origin: "contact",
            authorName: null,
            status: null,
            type: "text",
            text: "Olá!",
            sentAt: new Date("2026-10-20T12:00:00Z"),
            imported: false,
            editedAt: null,
            revokedAt: null,
          },
        ],
      },
    ]);
    expect(await conversationsOf(tenantB)).toEqual([]);
  });

  test("replaying a delivery, or an event inside another batch, creates no duplicates", async () => {
    const first = textMessageChange({ phoneNumberId: "300", wamid: "wamid.A1" });
    await receive(metaDelivery(first));
    await runJobs();
    const stored = await conversationsOf(tenantA);

    expect(await receive(metaDelivery(first))).toEqual({ ok: true });
    expect(queue.take()).toEqual([]);

    // Meta may batch the same message with new events about it. Each status
    // refers to the same wamid, yet each is a distinct event to process.
    const rebatched = metaDelivery(
      textMessageChange({ phoneNumberId: "300", wamid: "wamid.A2", body: "Segunda mensagem" }),
      first,
      statusChange({ phoneNumberId: "300", wamid: "wamid.OUT1", status: "delivered" }),
      statusChange({
        phoneNumberId: "300",
        wamid: "wamid.OUT1",
        status: "read",
        timestamp: "1792497800",
      }),
    );
    expect(await receive(rebatched)).toEqual({ ok: true });
    expect(queue.jobs).toHaveLength(3);
    await runJobs();
    await receive(rebatched);
    await runJobs();

    const [conversationAfter] = await conversationsOf(tenantA);
    expect(conversationAfter.id).toBe(stored[0].id);
    expect(conversationAfter.messages.map(({ wamid }) => wamid)).toEqual(["wamid.A1", "wamid.A2"]);
  });

  test("rejects invalid signatures without storing or enqueueing anything", async () => {
    const delivery = metaDelivery(textMessageChange({ phoneNumberId: "300", wamid: "wamid.A1" }));
    const tampered = delivery.replace("Olá", "Oi");

    for (const signature of [
      null,
      "",
      "sha256=",
      signMetaDelivery(delivery, "another-secret"),
      signMetaDelivery(delivery),
      `sha1=${signMetaDelivery(tampered).slice(7)}`,
    ]) {
      expect(await inbox.receive({ body: tampered, signature })).toEqual({
        ok: false,
        error: "invalid_signature",
      });
    }

    expect(queue.jobs).toEqual([]);
    // Storage is the criterion itself, so this one check reads the table.
    expect(await db.$count(inboxEvent)).toBe(0);
  });

  test("an event stored before a failed enqueue stays unprocessed and is recovered by redelivery", async () => {
    const delivery = metaDelivery(textMessageChange({ phoneNumberId: "300", wamid: "wamid.A1" }));
    queue.failing = true;

    expect(await receive(delivery)).toEqual({ ok: false, error: "enqueue_failed" });
    expect(await conversationsOf(tenantA)).toEqual([]);

    // Meta retries a delivery that was not acknowledged.
    queue.failing = false;
    expect(await receive(delivery)).toEqual({ ok: true });
    expect(queue.jobs).toHaveLength(1);
    await runJobs();
    expect((await conversationsOf(tenantA))[0].messages).toHaveLength(1);
  });

  test("an event for an unknown phone-number-id creates data in no Tenant", async () => {
    await receive(metaDelivery(textMessageChange({ phoneNumberId: "999", wamid: "wamid.X1" })));
    const [job] = queue.take();

    expect(await inbox.process(job.inboxEventId)).toEqual({ ok: true, status: "ignored" });
    expect(await conversationsOf(tenantA)).toEqual([]);
    expect(await conversationsOf(tenantB)).toEqual([]);
    expect(await inbox.process("missing")).toEqual({ ok: false, error: "not_found" });
  });

  test("files each event under the Tenant of the Channel it addressed", async () => {
    await receive(
      metaDelivery(
        textMessageChange({ phoneNumberId: "301", wamid: "wamid.B1", body: "Para B" }),
        textMessageChange({ phoneNumberId: "300", wamid: "wamid.A1", body: "Para A" }),
      ),
    );
    await runJobs();

    expect(
      (await conversationsOf(tenantA)).flatMap(({ messages }) => messages.map(({ text }) => text)),
    ).toEqual(["Para A"]);
    expect(await conversationsOf(tenantB)).toMatchObject([
      { channelId: "channel-b", messages: [{ text: "Para B" }] },
    ]);
  });

  test("edits and revokes reusing a message's wamid stay distinct, processable events", async () => {
    await receive(metaDelivery(textMessageChange({ phoneNumberId: "300", wamid: "wamid.A1" })));
    await runJobs();

    const edit = referencingChange({ phoneNumberId: "300", wamid: "wamid.A1", type: "edit" });
    const revoke = referencingChange({ phoneNumberId: "300", wamid: "wamid.A1", type: "revoke" });
    await receive(metaDelivery(edit, revoke));
    expect(queue.jobs).toHaveLength(2);
    await runJobs();
    await receive(metaDelivery(edit));
    expect(queue.take()).toEqual([]);

    expect((await conversationsOf(tenantA))[0].messages).toMatchObject([
      { wamid: "wamid.A1", text: null, revokedAt: expect.any(Date) },
    ]);
  });

  test("duplicate jobs for one event, even concurrent ones, store its message once", async () => {
    await receive(metaDelivery(textMessageChange({ phoneNumberId: "300", wamid: "wamid.A1" })));
    const [job] = queue.take();

    await Promise.all([inbox.process(job.inboxEventId), inbox.process(job.inboxEventId)]);
    await inbox.process(job.inboxEventId);

    const conversations = await conversationsOf(tenantA);
    expect(conversations).toHaveLength(1);
    expect(conversations[0].messages).toHaveLength(1);
  });
});

describe("Coexistence echoes", () => {
  test("a reply sent from the WhatsApp Business app appears as the team's reply", async () => {
    await receive(
      metaDelivery(
        textMessageChange({ phoneNumberId: "300", wamid: "wamid.A1", timestamp: "1792497600" }),
      ),
    );
    await receive(
      metaDelivery(
        messageEchoChange({
          phoneNumberId: "300",
          wamid: "wamid.APP1",
          body: "Abrimos sim!",
          timestamp: "1792497800",
        }),
      ),
    );
    await runJobs();

    const [{ messages }] = await conversationsOf(tenantA);
    expect(messages.at(-1)).toEqual({
      id: expect.any(String),
      wamid: "wamid.APP1",
      direction: "outbound",
      origin: "app",
      authorName: null,
      status: "sent",
      type: "text",
      text: "Abrimos sim!",
      sentAt: new Date("2026-10-20T12:03:20Z"),
      imported: false,
      editedAt: null,
      revokedAt: null,
    });
  });
});

describe("Edits and revokes", () => {
  test("edits and revokes invalidate the existing Conversation without carrying their text", async () => {
    await receive(
      metaDelivery(textMessageChange({ phoneNumberId: "300", wamid: "wamid.ORIGINAL" })),
    );
    await runJobs();
    const [found] = await conversationsOf(tenantA);
    notifier.pings.length = 0;

    await receive(
      metaDelivery(
        referencingChange({
          phoneNumberId: "300",
          wamid: "wamid.EDIT",
          originalWamid: "wamid.ORIGINAL",
          type: "edit",
          body: "Texto editado privado",
        }),
        referencingChange({
          phoneNumberId: "300",
          wamid: "wamid.REVOKE",
          originalWamid: "wamid.ORIGINAL",
          type: "revoke",
        }),
      ),
    );
    await runJobs();
    expect(notifier.pings).toEqual([
      { tenantId: "tenant-a", ping: { conversationId: found.id } },
      { tenantId: "tenant-a", ping: { conversationId: found.id } },
    ]);
  });

  // A Contact message and a team reply from the app, both edited later.
  const exchange = async () => {
    await receive(
      metaDelivery(
        textMessageChange({
          phoneNumberId: "300",
          wamid: "wamid.A1",
          body: "Vocês abrem sábado?",
          timestamp: "1792497600",
        }),
        messageEchoChange({
          phoneNumberId: "300",
          wamid: "wamid.APP1",
          body: "Abrimos sim",
          timestamp: "1792497700",
        }),
      ),
    );
    await runJobs();
  };

  const deliver = async (...changes: Parameters<typeof metaDelivery>) => {
    for (const change of changes) {
      await receive(metaDelivery(change));
      await runJobs();
    }
  };

  const displayedOf = async (scope: TenantScope) =>
    (await conversationsOf(scope)).flatMap(({ messages }) =>
      messages.map(({ wamid, text, sentAt, editedAt, revokedAt }) => ({
        wamid,
        text,
        sentAt,
        editedAt,
        revokedAt,
      })),
    );

  test("an edit by the Contact or from the app updates the original message in place", async () => {
    await exchange();

    await deliver(
      referencingChange({
        phoneNumberId: "300",
        wamid: "wamid.E1",
        originalWamid: "wamid.A1",
        type: "edit",
        body: "Vocês abrem domingo?",
        timestamp: "1792497900",
      }),
      referencingChange({
        phoneNumberId: "300",
        wamid: "wamid.E2",
        originalWamid: "wamid.APP1",
        type: "edit",
        by: "app",
        body: "Abrimos sim, das 9h às 13h",
        timestamp: "1792498000",
      }),
    );

    expect(await displayedOf(tenantA)).toEqual([
      {
        wamid: "wamid.A1",
        text: "Vocês abrem domingo?",
        sentAt: new Date("2026-10-20T12:00:00Z"),
        editedAt: new Date("2026-10-20T12:05:00Z"),
        revokedAt: null,
      },
      {
        wamid: "wamid.APP1",
        text: "Abrimos sim, das 9h às 13h",
        sentAt: new Date("2026-10-20T12:01:40Z"),
        editedAt: new Date("2026-10-20T12:06:40Z"),
        revokedAt: null,
      },
    ]);
  });

  test("a revoke by the Contact or from the app hides the original message's text in place", async () => {
    await exchange();

    await deliver(
      referencingChange({
        phoneNumberId: "300",
        wamid: "wamid.R1",
        originalWamid: "wamid.A1",
        type: "revoke",
        timestamp: "1792497900",
      }),
      referencingChange({
        phoneNumberId: "300",
        wamid: "wamid.R2",
        originalWamid: "wamid.APP1",
        type: "revoke",
        by: "app",
        timestamp: "1792498000",
      }),
    );

    expect(await displayedOf(tenantA)).toEqual([
      {
        wamid: "wamid.A1",
        text: null,
        sentAt: new Date("2026-10-20T12:00:00Z"),
        editedAt: null,
        revokedAt: new Date("2026-10-20T12:05:00Z"),
      },
      {
        wamid: "wamid.APP1",
        text: null,
        sentAt: new Date("2026-10-20T12:01:40Z"),
        editedAt: null,
        revokedAt: new Date("2026-10-20T12:06:40Z"),
      },
    ]);
  });

  test("changes arriving out of order or repeatedly settle on the latest edit, and a revoke stays final", async () => {
    const firstEdit = referencingChange({
      phoneNumberId: "300",
      wamid: "wamid.E1",
      originalWamid: "wamid.A1",
      type: "edit",
      body: "Primeira edição",
      timestamp: "1792497900",
    });
    const secondEdit = referencingChange({
      phoneNumberId: "300",
      wamid: "wamid.E2",
      originalWamid: "wamid.A1",
      type: "edit",
      body: "Segunda edição",
      timestamp: "1792498000",
    });
    // The latest edit arrives before the original message and the first edit.
    await deliver(secondEdit);
    await exchange();
    // Redelivered together, with duplicate jobs.
    await receive(metaDelivery(firstEdit, secondEdit));
    const jobs = queue.take();
    await Promise.all([...jobs, ...jobs].map((job) => inbox.process(job.inboxEventId)));

    expect((await displayedOf(tenantA))[0]).toEqual({
      wamid: "wamid.A1",
      text: "Segunda edição",
      sentAt: new Date("2026-10-20T12:00:00Z"),
      editedAt: new Date("2026-10-20T12:06:40Z"),
      revokedAt: null,
    });

    // An edit delivered after the revoke does not bring the text back.
    await deliver(
      referencingChange({
        phoneNumberId: "300",
        wamid: "wamid.R1",
        originalWamid: "wamid.A1",
        type: "revoke",
        timestamp: "1792498100",
      }),
      referencingChange({
        phoneNumberId: "300",
        wamid: "wamid.E3",
        originalWamid: "wamid.A1",
        type: "edit",
        body: "Tarde demais",
        timestamp: "1792498200",
      }),
    );
    expect((await displayedOf(tenantA))[0]).toMatchObject({
      wamid: "wamid.A1",
      text: null,
      revokedAt: new Date("2026-10-20T12:08:20Z"),
    });
  });

  test("a change only reaches its own Tenant's message, in the direction of who changed it", async () => {
    await exchange();

    await deliver(
      // The Contact cannot change the team's reply, nor the app the Contact's message.
      referencingChange({
        phoneNumberId: "300",
        wamid: "wamid.X1",
        originalWamid: "wamid.APP1",
        type: "revoke",
      }),
      referencingChange({
        phoneNumberId: "300",
        wamid: "wamid.X2",
        originalWamid: "wamid.A1",
        type: "edit",
        by: "app",
        body: "Adulterado",
      }),
      // Another Tenant's Channel naming this Tenant's message.
      referencingChange({
        phoneNumberId: "301",
        wamid: "wamid.X3",
        originalWamid: "wamid.A1",
        type: "revoke",
      }),
    );

    expect(
      (await displayedOf(tenantA)).map(({ text, editedAt, revokedAt }) => ({
        text,
        editedAt,
        revokedAt,
      })),
    ).toEqual([
      { text: "Vocês abrem sábado?", editedAt: null, revokedAt: null },
      { text: "Abrimos sim", editedAt: null, revokedAt: null },
    ]);
    expect(await conversationsOf(tenantB)).toEqual([]);
  });

  test("echoes of the platform's own sends, edits and revokes are not new activity", async () => {
    await receive(
      metaDelivery(
        textMessageChange({ phoneNumberId: "300", wamid: "wamid.A1", timestamp: "1792497600" }),
      ),
    );
    await runJobs();
    const [{ id: conversationId }] = await conversationsOf(tenantA);
    const replies = createReplyService({
      db,
      clock,
      notifier,
      getSender: createTestWhatsAppSender,
    });
    await replies.sendReply(tenantA, { conversationId, text: "Abrimos sim!" });
    const lastMessageAt = async () =>
      (await createConversationRepository(db, tenantA).listConversations()).conversations[0]
        .lastMessageAt;
    const before = await lastMessageAt();

    await deliver(
      messageEchoChange({
        phoneNumberId: "300",
        wamid: "wamid.OUT1",
        body: "Abrimos sim!",
        timestamp: "1792498500",
      }),
      referencingChange({
        phoneNumberId: "300",
        wamid: "wamid.E1",
        originalWamid: "wamid.A1",
        type: "edit",
        timestamp: "1792498600",
      }),
      referencingChange({
        phoneNumberId: "300",
        wamid: "wamid.R1",
        originalWamid: "wamid.OUT1",
        type: "revoke",
        by: "app",
        timestamp: "1792498700",
      }),
    );

    const [{ messages }] = await conversationsOf(tenantA);
    expect(messages.map(({ wamid, origin }) => ({ wamid, origin }))).toEqual([
      { wamid: "wamid.A1", origin: "contact" },
      { wamid: "wamid.OUT1", origin: "dashboard" },
    ]);
    expect(await lastMessageAt()).toEqual(before);
  });
});

describe("Delivery statuses", () => {
  // A Contact message, then a Member's dashboard reply to it, which Meta
  // accepts as wamid.OUT1.
  const replyToContact = async () => {
    await receive(metaDelivery(textMessageChange({ phoneNumberId: "300", wamid: "wamid.A1" })));
    await runJobs();
    const [{ id: conversationId }] = await conversationsOf(tenantA);
    const replies = createReplyService({
      db,
      clock,
      notifier,
      getSender: createTestWhatsAppSender,
    });
    expect(await replies.sendReply(tenantA, { conversationId, text: "Abrimos sim!" })).toEqual({
      ok: true,
    });
  };

  const statusesOf = async (scope: TenantScope) =>
    (await conversationsOf(scope)).flatMap(({ messages }) =>
      messages.map(({ wamid, status }) => ({ wamid, status })),
    );

  const deliver = async (...changes: ReturnType<typeof statusChange>[]) => {
    for (const change of changes) {
      await receive(metaDelivery(change));
      await runJobs();
    }
  };

  test("sent, delivered and read update the reply without creating messages", async () => {
    await replyToContact();
    expect(await statusesOf(tenantA)).toEqual([
      { wamid: "wamid.A1", status: null },
      { wamid: "wamid.OUT1", status: "pending" },
    ]);

    for (const status of ["sent", "delivered", "read"] as const) {
      await deliver(statusChange({ phoneNumberId: "300", wamid: "wamid.OUT1", status }));
      expect(await statusesOf(tenantA)).toEqual([
        { wamid: "wamid.A1", status: null },
        { wamid: "wamid.OUT1", status },
      ]);
    }
  });

  test("a status arriving after a later one does not move the reply back", async () => {
    await replyToContact();

    await deliver(
      statusChange({
        phoneNumberId: "300",
        wamid: "wamid.OUT1",
        status: "read",
        timestamp: "1792497800",
      }),
      statusChange({
        phoneNumberId: "300",
        wamid: "wamid.OUT1",
        status: "sent",
        timestamp: "1792497600",
      }),
      statusChange({
        phoneNumberId: "300",
        wamid: "wamid.OUT1",
        status: "delivered",
        timestamp: "1792497700",
      }),
    );

    expect((await statusesOf(tenantA)).at(-1)).toEqual({ wamid: "wamid.OUT1", status: "read" });
  });

  test("a failed status marks the reply as failed", async () => {
    await replyToContact();

    await deliver(
      statusChange({ phoneNumberId: "300", wamid: "wamid.OUT1", status: "sent" }),
      statusChange({
        phoneNumberId: "300",
        wamid: "wamid.OUT1",
        status: "failed",
        timestamp: "1792497800",
      }),
    );

    expect((await statusesOf(tenantA)).at(-1)).toEqual({ wamid: "wamid.OUT1", status: "failed" });
  });

  test("a status for another Channel's message, or for an unknown one, changes nothing", async () => {
    await replyToContact();

    await deliver(
      statusChange({ phoneNumberId: "301", wamid: "wamid.OUT1", status: "read" }),
      statusChange({ phoneNumberId: "300", wamid: "wamid.UNKNOWN", status: "read" }),
    );

    expect(await statusesOf(tenantA)).toEqual([
      { wamid: "wamid.A1", status: null },
      { wamid: "wamid.OUT1", status: "pending" },
    ]);
    expect(await conversationsOf(tenantB)).toEqual([]);
  });
});
