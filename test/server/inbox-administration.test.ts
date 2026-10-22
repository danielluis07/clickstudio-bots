import { expect, onTestFinished, test } from "bun:test";
import { createWebhookInbox } from "@/modules/webhook-inbox";
import { createReplayInboxAction } from "@/server/inbox-administration";
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
