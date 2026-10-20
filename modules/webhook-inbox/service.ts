import type { Database } from "@/db/database";
import { resolveChannelPhoneNumber } from "@/modules/channels";
import { recordInboundTextMessage } from "@/modules/conversations";
import { readInboundTextMessage, splitDelivery } from "@/modules/webhook-inbox/deliveries";
import type { JobQueue } from "@/modules/webhook-inbox/job-queue";
import { createInboxRepository } from "@/modules/webhook-inbox/repository";
import { isValidDeliverySignature } from "@/modules/webhook-inbox/signature";
import type { Clock } from "@/platform/clock";

// The inbox-first delivery contract of ADR 0002: store each signed event once,
// enqueue it, and only then acknowledge the delivery.
export const createWebhookInbox = ({ db, clock, queue, appSecret }: {
  db: Database;
  clock: Clock;
  queue: JobQueue;
  appSecret: string;
}) => {
  const repository = createInboxRepository(db);

  return {
    async receive({ body, signature }: { body: string; signature: string | null }) {
      if (!isValidDeliverySignature(body, signature, appSecret)) {
        return { ok: false as const, error: "invalid_signature" as const };
      }
      let delivery: unknown;
      try {
        delivery = JSON.parse(body);
      } catch {
        return { ok: false as const, error: "invalid_payload" as const };
      }
      const events = splitDelivery(delivery);
      if (events.length === 0) return { ok: true as const };
      await repository.insert(events, clock.now());
      // Redelivery re-enqueues whatever is still pending, so an event stored
      // before a failed enqueue is recovered by Meta's retry.
      const pendingIds = await repository.findPendingIds(events.map((event) => event.dedupeKey));
      if (pendingIds.length === 0) return { ok: true as const };
      try {
        await queue.enqueue(pendingIds.map((inboxEventId) => ({ type: "process-inbox-event" as const, inboxEventId })));
      } catch {
        return { ok: false as const, error: "enqueue_failed" as const };
      }
      return { ok: true as const };
    },

    // At-least-once: safe to run any number of times, concurrently included.
    async process(inboxEventId: string) {
      const event = await repository.find(inboxEventId);
      if (!event) return { ok: false as const, error: "not_found" as const };
      if (event.status !== "pending") return { ok: true as const, status: event.status };
      const route = event.phoneNumberId ? await resolveChannelPhoneNumber(db, event.phoneNumberId) : null;
      if (!route) {
        await repository.settle(inboxEventId, { status: "ignored", ignoredReason: "unknown_channel", processedAt: clock.now() });
        return { ok: true as const, status: "ignored" as const };
      }
      const inbound = readInboundTextMessage(event.payload);
      if (!inbound) {
        await repository.settle(inboxEventId, { status: "ignored", ignoredReason: "unsupported_event", processedAt: clock.now() });
        return { ok: true as const, status: "ignored" as const };
      }
      await recordInboundTextMessage(db, route, inbound);
      await repository.settle(inboxEventId, { status: "processed", processedAt: clock.now() });
      return { ok: true as const, status: "processed" as const };
    },
  };
};

export type WebhookInbox = ReturnType<typeof createWebhookInbox>;
