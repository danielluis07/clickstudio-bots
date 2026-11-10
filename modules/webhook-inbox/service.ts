import type { Database } from "@/db/database";
import {
  recordHistoryDeclined,
  resolveChannelPhoneNumber,
  type ChannelRoute,
} from "@/modules/channels";
import {
  recordAppContact,
  recordImportedHistory,
  recordInboundMessage,
  recordMessageChange,
  recordMessageEcho,
  recordMessageStatus,
} from "@/modules/conversations";
import {
  readAppContact,
  readHistory,
  readInboundMessage,
  readMessageChange,
  readMessageEcho,
  readMessageStatus,
  splitDelivery,
} from "@/modules/webhook-inbox/deliveries";
import type { JobQueue } from "@/modules/webhook-inbox/job-queue";
import { createInboxRepository } from "@/modules/webhook-inbox/repository";
import { isValidDeliverySignature } from "@/modules/webhook-inbox/signature";
import { isPlatformAdmin } from "@/modules/identity";
import { annotateError, classifyError, logError } from "@/platform/diagnostics";
import type { InboxDiagnostics } from "@/modules/webhook-inbox/diagnostics";
import type { Clock } from "@/platform/clock";
import type { Notifier } from "@/platform/notifier";
import type { LiveBot } from "@/modules/bot";

// A pending event this old that never failed has no live job: QStash delivers
// within seconds. One that failed may still be retried: QStash's last retry
// comes about 30 minutes after the one before it.
const stalledAfterMs = 5 * 60_000;
const stalledAfterFailureMs = 35 * 60_000;
// Bounds one sweep; the next one continues where it stopped.
const stalledPerSweep = 100;
// Past two requeues, a pending event that never failed means the queue is not
// draining (#137). Failed events alert on their own, after their last replay.
export const staleQueueAfterMs = 15 * 60_000;
// Automatic replays of a failed event (#135), each measured from the failure
// before it and each a full QStash delivery with its own retries. Together
// they outlast an outage of several hours and alert well inside WhatsApp's
// 24-hour service window. After the last one, the event waits for a person.
export const autoRetryDelaysMs = [10 * 60_000, 60 * 60_000, 4 * 60 * 60_000] as const;
const retriedPerSweep = 100;
// QStash takes a batch of jobs per request; a bulk replay sends several.
const enqueueBatchSize = 100;

// The inbox-first delivery contract of ADR 0002: store each signed event once,
// enqueue it, and only then acknowledge the delivery.
export const createWebhookInbox = ({
  db,
  clock,
  queue,
  notifier,
  appSecret,
  diagnostics,
  bot,
}: {
  db: Database;
  clock: Clock;
  queue: JobQueue;
  notifier: Notifier;
  appSecret: string;
  diagnostics?: InboxDiagnostics;
  bot?: Pick<LiveBot, "enqueue"> | null;
}) => {
  const repository = createInboxRepository(db);

  const enqueue = async (ids: string[]) => {
    for (let start = 0; start < ids.length; start += enqueueBatchSize)
      await queue.enqueue(
        ids
          .slice(start, start + enqueueBatchSize)
          .map((inboxEventId) => ({ type: "process-inbox-event" as const, inboxEventId })),
      );
  };

  // Records what the event carries under the route's Tenant; null when it
  // carries nothing the platform handles yet.
  const recordEvent = async (
    route: ChannelRoute,
    payload: unknown,
    receivedAt: Date,
  ): Promise<{
    conversationId?: string | null;
    contactId?: string | null;
  } | null> => {
    const inbound = readInboundMessage(payload);
    if (inbound)
      return {
        conversationId: await recordInboundMessage(db, route, { ...inbound, receivedAt }),
      };
    const statusUpdate = readMessageStatus(payload);
    if (statusUpdate) return { conversationId: await recordMessageStatus(db, route, statusUpdate) };
    const echo = readMessageEcho(payload);
    if (echo)
      return (
        (await recordMessageEcho(db, route, { ...echo, receivedAt })) ?? { conversationId: null }
      );
    const change = readMessageChange(payload);
    if (change)
      return { conversationId: await recordMessageChange(db, route, { ...change, receivedAt }) };
    // Imported history is never a reason for a Bot turn or a Handoff.
    const history = readHistory(payload);
    if (history?.declined) {
      await recordHistoryDeclined(db, route);
      return {};
    }
    if (history)
      return {
        conversationId: await recordImportedHistory(db, route, { ...history.history, receivedAt }),
      };
    const appContact = readAppContact(payload);
    if (appContact)
      return { contactId: await recordAppContact(db, route, { ...appContact, receivedAt }) };
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
      const route = event.phoneNumberId
        ? await resolveChannelPhoneNumber(db, event.phoneNumberId)
        : null;
      tenantId = route?.tenantId;
      const recorded = route && (await recordEvent(route, event.payload, event.receivedAt));
      if (!recorded) {
        await repository.settle(inboxEventId, clock.now(), {
          status: "ignored",
          ignoredReason: route ? "unsupported_event" : "unknown_channel",
        });
        return { ok: true as const, status: "ignored" as const };
      }
      conversationId = recorded.conversationId ?? undefined;
      // Enqueue before settling, so a queue failure retries the committed,
      // idempotent inbound write. Media already handed off fails eligibility;
      // captions can start a turn. History, statuses and echoes never do.
      if (route && conversationId && readInboundMessage(event.payload))
        await bot?.enqueue(route, conversationId);
      // A failed ping retries the idempotent committed write and ping together.
      if (recorded.conversationId)
        await notifier.publish(route!.tenantId, { conversationId: recorded.conversationId });
      else if (recorded.contactId)
        await notifier.publish(route!.tenantId, { contactId: recorded.contactId });
      await repository.settle(inboxEventId, clock.now(), { status: "processed" });
      return { ok: true as const, status: "processed" as const };
    } catch (error) {
      await repository.recordFailure([inboxEventId], classifyError(error), clock.now());
      // The caller records the failure once; these ids travel with it.
      throw annotateError(error, { inboxEventId, tenantId, conversationId });
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
        // A signed but malformed delivery is Meta's 400, not a failure.
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
        await queue.enqueue(
          pendingIds.map((inboxEventId) => ({
            type: "process-inbox-event" as const,
            inboxEventId,
          })),
        );
      } catch (error) {
        // Meta's redelivery recovers it; the record says why the queue refused.
        logError("inbox_enqueue_failed", error, {}, diagnostics?.log);
        await repository.recordFailure(pendingIds, "QueueError", clock.now());
        return { ok: false as const, error: "enqueue_failed" as const };
      }
      return { ok: true as const };
    },

    // At-least-once: safe to run any number of times, concurrently included.
    process: (inboxEventId: string) => process(inboxEventId),

    // The sweep: re-enqueues pending events whose job was lost, for example
    // with its failure callback. Processing is idempotent, so a job that was
    // only slow costs a duplicate delivery. Failed events wait for
    // `retryFailed` or an administrator.
    async requeueStalled() {
      const now = clock.now().getTime();
      const ids = await repository.listPendingBefore(
        {
          receivedBy: new Date(now - stalledAfterMs),
          failedBy: new Date(now - stalledAfterFailureMs),
        },
        stalledPerSweep,
      );
      await enqueue(ids);
      return ids.length;
    },

    // The sweep: alerts while the oldest pending event that never failed is
    // older than `staleQueueAfterMs`. Returns its age in seconds, or null.
    async alertStaleQueue() {
      const oldest = await repository.oldestPendingReceivedAt();
      if (!oldest) return null;
      const ageMs = clock.now().getTime() - oldest.getTime();
      if (ageMs < staleQueueAfterMs) return null;
      const ageSeconds = Math.floor(ageMs / 1000);
      await diagnostics?.alert({ kind: "inbox_queue_stale", ageSeconds });
      return ageSeconds;
    },

    // The sweep: replays failed events whose next automatic replay is due, by
    // putting them back to pending and on the queue. If the enqueue fails, the
    // stalled-event scan picks them up 35 minutes later.
    async retryFailed() {
      const now = clock.now().getTime();
      const ids = await repository.listRetryDue(
        autoRetryDelaysMs.map((delay) => new Date(now - delay)),
        retriedPerSweep,
      );
      const moved = await repository.markRetried(ids, clock.now());
      await enqueue(moved);
      return moved.length;
    },

    // QStash's failure callback. An event with automatic replays left stays
    // quiet: the sweep replays it. Only the last failure alerts.
    async fail(inboxEventId: string, jobId: string) {
      const failed = await repository.fail(inboxEventId, clock.now());
      if (!failed || failed.autoRetries < autoRetryDelaysMs.length) return;
      await diagnostics?.alert({
        kind: "inbox_dead_letter",
        inboxEventId,
        jobId,
        errorClass: failed.errorClass ?? "JobDeliveryError",
      });
      await repository.markAlerted(inboxEventId, clock.now());
    },

    async listFailures(actorId: string, page = 1) {
      if (!(await isPlatformAdmin(db, actorId)))
        return { ok: false as const, error: "forbidden" as const };
      const { events, hasMore } = await repository.listFailures(
        Number.isSafeInteger(page) && page >= 1 ? page : 1,
      );
      return {
        ok: true as const,
        hasMore,
        events: events.map(({ alertedAt, ...event }) => {
          const delay: number | undefined = autoRetryDelaysMs[event.autoRetries];
          const lastFailure = event.status === "failed" && !alertedAt ? event.failedAt : null;
          return {
            ...event,
            nextAutoRetryAt:
              lastFailure && delay !== undefined ? new Date(lastFailure.getTime() + delay) : null,
          };
        }),
      };
    },

    // Puts the given listed failures, or all of them, back on the queue with a
    // fresh set of automatic replays. Takes event ids only: each job resolves
    // its Tenant from the stored event, as any other.
    async replayFailures(actorId: string, inboxEventIds?: readonly string[]) {
      if (!(await isPlatformAdmin(db, actorId)))
        return { ok: false as const, error: "forbidden" as const };
      if (inboxEventIds?.length === 0) return { ok: true as const, requeued: 0 };
      const moved = await repository.resetFailures(
        inboxEventIds ? [...inboxEventIds] : null,
        clock.now(),
      );
      await enqueue(moved);
      return { ok: true as const, requeued: moved.length };
    },

    async replay(actorId: string, inboxEventId: string) {
      if (!(await isPlatformAdmin(db, actorId)))
        return { ok: false as const, error: "forbidden" as const };
      return process(inboxEventId, true);
    },
  };
};

export type WebhookInbox = ReturnType<typeof createWebhookInbox>;
