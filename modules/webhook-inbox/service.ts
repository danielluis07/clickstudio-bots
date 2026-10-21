import type { Database } from "@/db/database";
import { resolveChannelPhoneNumber, type ChannelRoute } from "@/modules/channels";
import { recordInboundTextMessage, recordMessageChange, recordMessageEcho, recordMessageStatus } from "@/modules/conversations";
import { readInboundTextMessage, readMessageChange, readMessageEcho, readMessageStatus, splitDelivery } from "@/modules/webhook-inbox/deliveries";
import type { JobQueue } from "@/modules/webhook-inbox/job-queue";
import { createInboxRepository } from "@/modules/webhook-inbox/repository";
import { isValidDeliverySignature } from "@/modules/webhook-inbox/signature";
import type { Clock } from "@/platform/clock";
import type { Notifier } from "@/platform/notifier";

// The inbox-first delivery contract of ADR 0002: store each signed event once,
// enqueue it, and only then acknowledge the delivery.
export const createWebhookInbox = ({ db, clock, queue, notifier, appSecret }: {
  db: Database;
  clock: Clock;
  queue: JobQueue;
  notifier: Notifier;
  appSecret: string;
}) => {
  const repository = createInboxRepository(db);

  // Records what the event carries under the route's Tenant; null when it
  // carries nothing the platform handles yet.
  const recordEvent = async (route: ChannelRoute, payload: unknown) => {
    const inbound = readInboundTextMessage(payload);
    if (inbound) return { conversationId: await recordInboundTextMessage(db, route, inbound) };
    const statusUpdate = readMessageStatus(payload);
    if (statusUpdate) return { conversationId: await recordMessageStatus(db, route, statusUpdate) };
    const echo = readMessageEcho(payload);
    if (echo) return recordMessageEcho(db, route, echo);
    const change = readMessageChange(payload);
    if (change) return { conversationId: await recordMessageChange(db, route, change) };
    return null;
  };

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
      const recorded = route && await recordEvent(route, event.payload);
      if (!recorded) {
        await repository.settle(inboxEventId, clock.now(), {
          status: "ignored",
          ignoredReason: route ? "unsupported_event" : "unknown_channel",
        });
        return { ok: true as const, status: "ignored" as const };
      }
      // Writes have committed. A publish failure leaves the job pending so
      // QStash can retry the idempotent write and the ping together.
      if (recorded.conversationId) await notifier.publish(route!.tenantId, { conversationId: recorded.conversationId });
      await repository.settle(inboxEventId, clock.now(), { status: "processed" });
      return { ok: true as const, status: "processed" as const };
    },
  };
};

export type WebhookInbox = ReturnType<typeof createWebhookInbox>;
