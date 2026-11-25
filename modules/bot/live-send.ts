import type { Database } from "@/db/database";
import { recordCredentialRejected, type ChannelRoute } from "@/modules/channels";
import type { WhatsAppSender } from "@/modules/conversations";
import type { Clock } from "@/platform/clock";
import { logError } from "@/platform/diagnostics";
import { RetryableError } from "@/platform/retryable";
import { CredentialRejectedError } from "@/platform/whatsapp-credentials";

// Waits before resending a reply Meta refused, within the turn's lease and
// its job's time limit. A send that fails after the last one hands off.
const sendRetryDelaysMs = [1_000, 3_000];

export const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Null when the send failed: Meta refused it on every try, or may have
// received it. Only a refusal is retried, with the same pending reply. A
// rejected credential marks the Channel unhealthy, which stops new turns.
export const createSendWithRetry =
  ({ db, clock, sleep }: { db: Database; clock: Clock; sleep: (ms: number) => Promise<void> }) =>
  async (
    scope: ChannelRoute,
    sender: WhatsAppSender,
    input: Parameters<WhatsAppSender["sendText"]>[0],
  ) => {
    for (const delay of [...sendRetryDelaysMs, null]) {
      try {
        return await sender.sendText(input);
      } catch (error) {
        if (error instanceof CredentialRejectedError) {
          // Best effort: the turn still fails its reply and hands off.
          await recordCredentialRejected(db, scope, scope.channelId, clock.now()).catch(
            (recordError: unknown) =>
              logError("channel_health_record_failed", recordError, {
                tenantId: scope.tenantId,
              }),
          );
          return null;
        }
        if (delay === null || !(error instanceof RetryableError)) return null;
        await sleep(delay);
      }
    }
    return null;
  };
