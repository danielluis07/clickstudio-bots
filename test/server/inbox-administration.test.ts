import { expect, onTestFinished, test } from "bun:test";
import { createWebhookInbox } from "@/modules/webhook-inbox";
import { inboxEvent, user } from "@/db/schema";
import { createReplayFailuresAction, createReplayInboxAction } from "@/server/inbox-administration";
import { idleFormState } from "@/server/actions/form-state";
import { createTestClock } from "@/test/support/clock";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";
import { createTestJobQueue } from "@/test/support/job-queue";
import { createTestNotifier } from "@/test/support/notifier";

test("the replay action authenticates before parsing input or accessing an unavailable inbox", async () => {
  const action = createReplayInboxAction({
    inbox: null,
    requireAdmin: async () => {
      throw new Error("Unauthorized");
    },
  });
  await expect(action(idleFormState, new FormData())).rejects.toThrow("Unauthorized");
});

test("the replay action validates event IDs and returns fixed pt-BR errors without exposing processing details", async () => {
  const db = await createTestDatabase();
  onTestFinished(() => closeTestDatabase(db));
  const inbox = createWebhookInbox({
    db,
    clock: createTestClock(),
    queue: createTestJobQueue(),
    notifier: createTestNotifier(),
    appSecret: "secret",
  });
  // A forged transport identity still fails the module's database role check.
  const action = createReplayInboxAction({
    inbox,
    requireAdmin: async () => ({ user: { id: "unknown" } }),
  });
  const invalid = new FormData();
  invalid.set("inboxEventId", "Private 5511988887777");
  expect(await action(idleFormState, invalid)).toEqual({
    status: "error",
    message: "Evento inválido.",
  });
  const valid = new FormData();
  valid.set("inboxEventId", "019a0871-5e00-7000-8000-000000000001");
  expect(await action(idleFormState, valid)).toEqual({
    status: "error",
    message: "Você não tem permissão para reprocessar eventos.",
  });
});

test("the bulk replay action authenticates before parsing input or accessing an unavailable inbox", async () => {
  const action = createReplayFailuresAction({
    inbox: null,
    requireAdmin: async () => {
      throw new Error("Unauthorized");
    },
  });
  await expect(action(idleFormState, new FormData())).rejects.toThrow("Unauthorized");
});

test("the bulk replay action accepts one page of event IDs or every failure, and rechecks the role", async () => {
  const db = await createTestDatabase();
  onTestFinished(() => closeTestDatabase(db));
  await db
    .insert(user)
    .values({ id: "admin", name: "Admin", email: "a@example.com", role: "admin" });
  const queue = createTestJobQueue();
  const inbox = createWebhookInbox({
    db,
    clock: createTestClock(),
    queue,
    notifier: createTestNotifier(),
    appSecret: "secret",
  });
  const form = (scope: string, ids: string[] = []) => {
    const data = new FormData();
    data.set("scope", scope);
    for (const id of ids) data.append("inboxEventId", id);
    return data;
  };
  const eventId = "019a0871-5e00-7000-8000-000000000001";

  const forged = createReplayFailuresAction({
    inbox,
    requireAdmin: async () => ({ user: { id: "unknown" } }),
  });
  expect(await forged(idleFormState, form("all"))).toEqual({
    status: "error",
    message: "Você não tem permissão para reprocessar eventos.",
  });

  const action = createReplayFailuresAction({
    inbox,
    requireAdmin: async () => ({ user: { id: "admin" } }),
  });
  for (const invalid of [
    form("tenant"),
    form("page"),
    form("page", ["Private 5511988887777"]),
    form(
      "page",
      Array.from({ length: 51 }, () => eventId),
    ),
  ])
    expect(await action(idleFormState, invalid)).toEqual({
      status: "error",
      message: "Eventos inválidos.",
    });
  expect(await action(idleFormState, form("all"))).toEqual({
    status: "success",
    message: "Nenhum evento com falha para reprocessar.",
  });

  await db.insert(inboxEvent).values({
    id: eventId,
    dedupeKey: eventId,
    field: "messages",
    payload: {},
    status: "failed",
    errorClass: "Error",
    receivedAt: new Date(),
  });
  expect(await action(idleFormState, form("page", [eventId]))).toEqual({
    status: "success",
    message: "1 evento enviado para reprocessamento. Atualize em instantes.",
  });
  expect(queue.take()).toEqual([{ type: "process-inbox-event", inboxEventId: eventId }]);

  queue.failing = true;
  expect(await action(idleFormState, form("all"))).toEqual({
    status: "error",
    message:
      "Não foi possível enviar todos os eventos para reprocessamento. Tente novamente após corrigir a falha.",
  });
});
