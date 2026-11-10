import type { WhatsAppSender } from "@/modules/conversations";
import { RetryableError } from "@/platform/retryable";

type SentText = Parameters<WhatsAppSender["sendText"]>[0];

export type TestWhatsAppSender = WhatsAppSender & {
  sent: SentText[];
  // Every call to `sendText`, whether Meta accepted it or not.
  attempts: number;
  // The next send may or may not have reached Meta.
  failNext(): void;
  // Meta refuses the next sends, as with a rate limit; nothing is sent.
  refuseNext(times?: number): void;
  // Runs once Meta has accepted a send, before the sender learns its wamid,
  // as when the send's echo is processed first.
  beforeAnswering(callback: (wamid: string) => Promise<unknown>): void;
};

// Accepts every send with a fresh wamid, as Meta would, unless told to fail.
export const createTestWhatsAppSender = (): TestWhatsAppSender => {
  const sent: SentText[] = [];
  let shouldFail = false;
  let refusals = 0;
  let onAccepted: ((wamid: string) => Promise<unknown>) | null = null;

  const sender: TestWhatsAppSender = {
    sent,
    attempts: 0,
    failNext: () => {
      shouldFail = true;
    },
    refuseNext: (times = 1) => {
      refusals = times;
    },
    beforeAnswering: (callback) => {
      onAccepted = callback;
    },
    sendText: async (input) => {
      sender.attempts++;
      if (refusals > 0) {
        refusals--;
        throw new RetryableError("WhatsApp send refused", {
          cause: new Error("Rate limit hit"),
        });
      }
      if (shouldFail) {
        shouldFail = false;
        throw new Error("WhatsApp unavailable");
      }
      sent.push(input);
      const wamid = `wamid.OUT${sent.length}`;
      await onAccepted?.(wamid);
      return { wamid };
    },
  };
  return sender;
};
