import type { Database } from "@/db/database";
import { recordHistoryDeclined, resolveChannelPhoneNumber, type ChannelRoute } from "@/modules/channels";
import {
  recordAppContact, recordImportedHistory, recordInboundTextMessage, recordMessageChange, recordMessageEcho, recordMessageStatus,
} from "@/modules/conversations";
import {
  readAppContact, readHistory, readInboundTextMessage, readMessageChange, readMessageEcho, readMessageStatus, splitDelivery,
} from "@/modules/webhook-inbox/deliveries";
import type { JobQueue } from "@/modules/webhook-inbox/job-queue";
import { createInboxRepository } from "@/modules/webhook-inbox/repository";
import { isValidDeliverySignature } from "@/modules/webhook-inbox/signature";
import { isPlatformAdmin } from "@/modules/identity";
import { classifyError } from "@/platform/diagnostics";
import type { InboxDiagnostics } from "@/modules/webhook-inbox/diagnostics";
import type { Clock } from "@/platform/clock";
import type { Notifier } from "@/platform/notifier";

// The inbox-first delivery contract of ADR 0002: store each signed event once,
// enqueue it, and only then acknowledge the delivery.
export const createWebhookInbox = ({ db, clock, queue, notifier, appSecret, diagnostics }: {
  db: Database;
  clock: Clock;
  queue: JobQueue;
  notifier: Notifier;
  appSecret: string;
  diagnostics?: InboxDiagnostics;
}) => {
  const repository = createInboxRepository(db);

  // Records what the event carries under the route's Tenant; null when it
  // carries nothing the platform handles yet.
  const recordEvent = async (route: ChannelRoute, payload: unknown, receivedAt: Date): Promise<{
    conversationId?: string | null;
    contactId?: string | null;
  } | null> => {
    const inbound = readInboundTextMessage(payload);
    if (inbound) return { conversationId: await recordInboundTextMessage(db, route, { ...inbound, receivedAt }) };
    const statusUpdate = readMessageStatus(payload);
    if (statusUpdate) return { conversationId: await recordMessageStatus(db, route, statusUpdate) };
    const echo = readMessageEcho(payload);
    if (echo) return await recordMessageEcho(db, route, { ...echo, receivedAt }) ?? { conversationId: null };
    const change = readMessageChange(payload);
    if (change) return { conversationId: await recordMessageChange(db, route, { ...change, receivedAt }) };
    // Imported history is never a reason for a Bot turn or a Handoff.
    const history = readHistory(payload);
    if (history?.declined) {
      await recordHistoryDeclined(db, route);
      return {};
    }
    if (history) return { conversationId: await recordImportedHistory(db, route, { ...history.history, receivedAt }) };
    const appContact = readAppContact(payload);
    if (appContact) return { contactId: await recordAppContact(db, route, { ...appContact, receivedAt }) };
    return null;
  };

  // Replays share the exact same writes and Channel-derived Tenant route.
  // Keep a dead-letter event failed until success, so a duplicate callback
  // cannot interrupt a replay by resetting its state.
  const process = async (inboxEventId: string, replay = false) => {
    const event = await repository.find(inboxEventId);
    if (!event) return { ok: false as const, error: "not_found" as const };
    if (event.status !== "pending" && !(replay && event.status === "failed")) {
      return { ok: true as const, status: event.status };
    }
    let tenantId: string | undefined;
    let conversationId: string | undefined;
    try {
      const route = event.phoneNumberId ? await resolveChannelPhoneNumber(db, event.phoneNumberId) : null;
      tenantId = route?.tenantId;
      const recorded = route && await recordEvent(route, event.payload, event.receivedAt);
      if (!recorded) {
        await repository.settle(inboxEventId, clock.now(), {
          status: "ignored", ignoredReason: route ? "unsupported_event" : "unknown_channel",
        });
        return { ok: true as const, status: "ignored" as const };
      }
      conversationId = recorded.conversationId ?? undefined;
      // A failed ping retries the idempotent committed write and ping together.
      if (recorded.conversationId) await notifier.publish(route!.tenantId, { conversationId: recorded.conversationId });
      else if (recorded.contactId) await notifier.publish(route!.tenantId, { contactId: recorded.contactId });
      await repository.settle(inboxEventId, clock.now(), { status: "processed" });
      return { ok: true as const, status: "processed" as const };
    } catch (error) {
      const errorClass = classifyError(error);
      await repository.recordFailure([inboxEventId], errorClass, clock.now());
      diagnostics?.log({ kind: "inbox_processing_failed", errorClass, inboxEventId, tenantId, conversationId });
      throw error;
    }
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
        await repository.recordFailure(pendingIds, "QueueError", clock.now());
        return { ok: false as const, error: "enqueue_failed" as const };
      }
      return { ok: true as const };
    },

    // At-least-once: safe to run any number of times, concurrently included.
    process: (inboxEventId: string) => process(inboxEventId),

    async fail(inboxEventId: string, jobId: string) {
      const failed = await repository.fail(inboxEventId, clock.now());
      if (!failed) return;
      await diagnostics?.alert({ kind: "inbox_dead_letter", inboxEventId, jobId, errorClass: failed.errorClass ?? "JobDeliveryError" });
      await repository.markAlerted(inboxEventId, clock.now());
    },

    async listFailures(actorId: string, page = 1) {
      if (!await isPlatformAdmin(db, actorId)) return { ok: false as const, error: "forbidden" as const };
      const failures = await repository.listFailures(Number.isSafeInteger(page) && page >= 1 ? page : 1);
      return { ok: true as const, ...failures };
    },

    async replay(actorId: string, inboxEventId: string) {
      if (!await isPlatformAdmin(db, actorId)) return { ok: false as const, error: "forbidden" as const };
      return process(inboxEventId, true);
    },
  };
};

export type WebhookInbox = ReturnType<typeof createWebhookInbox>;
