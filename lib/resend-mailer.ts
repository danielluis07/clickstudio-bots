import type { Mailer } from "@/lib/mailer";

type ResendMailerOptions = {
  apiKey: string;
  from: string;
};

// https://resend.com/docs/api-reference/emails/send-email
export const createResendMailer = ({ apiKey, from }: ResendMailerOptions): Mailer => ({
  async send({ to, subject, html, text }) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
    });
    if (!response.ok) {
      // Status only: the response body may echo the recipient address.
      throw new Error(`Resend rejected the email with status ${response.status}`);
    }
  },
});
