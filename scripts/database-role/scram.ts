import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";

const iterations = 4096;

// The SCRAM-SHA-256 verifier Postgres stores for a password (RFC 5802,
// RFC 7677), in the format `CREATE ROLE ... PASSWORD` accepts as already
// hashed. Sending it instead of the password keeps the password out of any
// server log that records the statement. Passwords are taken as given,
// without SASLprep, which changes nothing for ASCII.
export const scramSha256Verifier = (password: string, salt: Buffer = randomBytes(16)) => {
  const salted = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest("base64");
  const serverKey = createHmac("sha256", salted).update("Server Key").digest("base64");
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${storedKey}:${serverKey}`;
};
