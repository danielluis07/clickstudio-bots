import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { Transaction } from "@/db/database";
import { contactDeletion } from "@/db/schema";

export const contactAddressHash = (tenantId: string, phone: string) =>
  createHash("sha256").update(`${tenantId}:${phone}`).digest("hex");

// All Contact creation and deletion uses this short transaction lock. A
// job that began before deletion must either commit first and be deleted,
// or read the committed barrier before it can file anything.
export const lockContact = async (tx: Transaction, tenantId: string, phone: string) => {
  const addressHash = contactAddressHash(tenantId, phone);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`contact:${addressHash}`}, 0))`);
  const [marker] = await tx.select({ deletedAt: contactDeletion.deletedAt }).from(contactDeletion)
    .where(and(eq(contactDeletion.tenantId, tenantId), eq(contactDeletion.addressHash, addressHash)));
  return marker?.deletedAt ?? null;
};

// Meta timestamps have second precision. Suppress the ambiguous deletion
// second as well: a delayed old message is indistinguishable from a fresh
// one within that second, and must never restore erased data.
export const predatesDeletion = (deletedAt: Date | null, occurredAt: Date, receivedAt?: Date) =>
  deletedAt !== null && (occurredAt <= deletedAt || (receivedAt !== undefined && receivedAt <= deletedAt));
