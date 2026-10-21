import type { WhatsAppSender } from "@/modules/conversations";

type SentText = Parameters<WhatsAppSender["sendText"]>[0];

export type TestWhatsAppSender = WhatsAppSender & {
  sent: SentText[];
  failNext(): void;
  // Runs once Meta has accepted a send, before the sender learns its wamid,
  // as when the send's echo is processed first.
  beforeAnswering(callback: (wamid: string) => Promise<unknown>): void;
};

// Accepts every send with a fresh wamid, as Meta would, unless told to fail.
export const createTestWhatsAppSender = (): TestWhatsAppSender => {
  const sent: SentText[] = [];
  let shouldFail = false;
  let onAccepted: ((wamid: string) => Promise<unknown>) | null = null;

  return {
    sent,
    failNext: () => {
      shouldFail = true;
    },
    beforeAnswering: (callback) => {
      onAccepted = callback;
    },
    sendText: async (input) => {
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
};
