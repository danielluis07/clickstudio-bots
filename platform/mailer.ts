export type Email = {
  idempotencyKey?: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type Mailer = {
  send(email: Email): Promise<void>;
};

// For values interpolated into an email's HTML body.
export const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
