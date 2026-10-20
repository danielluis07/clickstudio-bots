import { createHash, createHmac } from "node:crypto";

export const qstashSigningKeys = { currentSigningKey: "sig_current_test", nextSigningKey: "sig_next_test" };

const base64url = (value: Buffer | string) => Buffer.from(value).toString("base64url");

// Signs a request the way QStash does: an HS256 JWT over the URL and body hash.
export const signQStashRequest = ({ url, body, key = qstashSigningKeys.currentSigningKey, now = Date.now() }: {
  url: string;
  body: string;
  key?: string;
  now?: number;
}) => {
  const seconds = Math.floor(now / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss: "Upstash",
    sub: url,
    iat: seconds,
    nbf: seconds,
    exp: seconds + 300,
    jti: crypto.randomUUID(),
    body: base64url(createHash("sha256").update(body).digest()),
  }));
  const signature = base64url(createHmac("sha256", key).update(`${header}.${claims}`).digest());
  return `${header}.${claims}.${signature}`;
};
