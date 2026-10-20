import type { Email, Mailer } from "@/lib/mailer";

export type TestMailer = Mailer & {
  sent: Email[];
  failNext(): void;
};

export const createTestMailer = (): TestMailer => {
  const sent: Email[] = [];
  let shouldFail = false;

  return {
    sent,
    failNext: () => {
      shouldFail = true;
    },
    send: async (email) => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error("Mailer unavailable");
      }
      sent.push(email);
    },
  };
};
