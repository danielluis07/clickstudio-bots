import { expect, test } from "bun:test";
import { createHash, createHmac } from "node:crypto";
import { scramSha256Verifier } from "@/scripts/database-role/scram";

// The SCRAM-SHA-256 exchange from RFC 7677, section 3: password "pencil".
const salt = "W22ZaJ0SNY7soEsUEjb6gQ==";
const nonce = "rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0";
const authMessage = `n=user,r=rOprNGfwEbeRWgbNEkqO,r=${nonce},s=${salt},i=4096,c=biws,r=${nonce}`;
const clientProof = Buffer.from("dHzbZapWIk4jUhN+Ute9ytag9zjfMHgsqmmiz7AndVQ=", "base64");
const serverSignature = "6rriTRBi23WpRR/wtup+mMhUZUn/dB5nLTJRsjl95G4=";

const hmac = (key: Buffer, text: string) => createHmac("sha256", key).update(text).digest();

test("the verifier accepts the RFC 7677 client's proof and produces its server signature", () => {
  const verifier = scramSha256Verifier("pencil", Buffer.from(salt, "base64"));
  const match = /^SCRAM-SHA-256\$4096:([^$]+)\$([^:]+):(.+)$/.exec(verifier);
  expect(match?.[1]).toBe(salt);
  const storedKey = Buffer.from(match![2], "base64");
  const serverKey = Buffer.from(match![3], "base64");

  expect(hmac(serverKey, authMessage).toString("base64")).toBe(serverSignature);
  const signature = hmac(storedKey, authMessage);
  const clientKey = Buffer.from(clientProof.map((byte, index) => byte ^ signature[index]));
  expect(createHash("sha256").update(clientKey).digest()).toEqual(storedKey);
});

test("each verifier gets its own random salt and never contains the password", () => {
  const first = scramSha256Verifier("a-long-test-password");
  expect(first).not.toBe(scramSha256Verifier("a-long-test-password"));
  expect(first).not.toContain("a-long-test-password");
});
