import type { WhatsAppSender } from "@/modules/conversations";

type SentText = Parameters<WhatsAppSender["sendText"]>[0];

export type TestWhatsAppSender = WhatsAppSender & {
  sent: SentText[];
  failNext(): void;
};

// Accepts every send with a fresh wamid, as Meta would, unless told to fail.
export const createTestWhatsAppSender = (): TestWhatsAppSender => {
  const sent: SentText[] = [];
  let shouldFail = false;

  return {
    sent,
    failNext: () => {
      shouldFail = true;
    },
    sendText: async (input) => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error("WhatsApp unavailable");
      }
      sent.push(input);
      return { wamid: `wamid.OUT${sent.length}` };
    },
  };
};
