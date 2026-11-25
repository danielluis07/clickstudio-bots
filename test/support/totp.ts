import { createHmac } from "node:crypto";

// What an authenticator app shows for an otpauth:// link right now (RFC 6238:
// SHA-1, 6 digits, 30-second steps). Imports nothing from the app, so the
// browser suite can use it too.

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const decodeBase32 = (encoded: string) => {
  let bits = "";
  for (const character of encoded.replace(/[\s=]/g, "").toUpperCase()) {
    const value = base32Alphabet.indexOf(character);
    if (value < 0) throw new Error(`Not base32: ${character}`);
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((byte) => Number.parseInt(byte, 2)));
};

// `secret` is the base32 setup key, with or without the spaces the page adds.
export const totpCode = (secret: string, now = Date.now()) => {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / 30)));
  const hash = createHmac("sha1", decodeBase32(secret)).update(counter).digest();
  const offset = hash[hash.length - 1]! & 0xf;
  const value = hash.readUInt32BE(offset) & 0x7fffffff;
  return String(value % 1_000_000).padStart(6, "0");
};

export const totpSecretOf = (totpUri: string) => new URL(totpUri).searchParams.get("secret") ?? "";
