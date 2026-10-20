import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Meta signs the raw body with the app secret: `X-Hub-Signature-256: sha256=<hex>`.
export const isValidDeliverySignature = (body: string, header: string | null, appSecret: string) => {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(body, "utf8").digest();
  const received = Buffer.from(header.slice("sha256=".length), "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
};

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

// The verification handshake Meta performs when the callback URL is saved.
// Returns the challenge to echo back, or null to refuse.
export const answerSubscriptionChallenge = (
  request: { mode: string | null; token: string | null; challenge: string | null },
  verifyToken: string,
) => {
  if (request.mode !== "subscribe" || request.token === null || !request.challenge) return null;
  return timingSafeEqual(digest(request.token), digest(verifyToken)) ? request.challenge : null;
};
