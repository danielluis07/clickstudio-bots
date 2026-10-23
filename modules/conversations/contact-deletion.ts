import { createHash } from "node:crypto";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { Database, Transaction } from "@/db/database";
import {
  contact,
  contactDeletion,
  conversation,
  message,
  messageChange,
  organization,
} from "@/db/schema";
import type { ChannelRoute } from "@/modules/channels";
import type { TenantScope } from "@/modules/tenancy";
import type { Clock } from "@/platform/clock";
import { notifyInbox, type Notifier } from "@/platform/notifier";

const contactAddressHash = (tenantId: string, phone: string) =>
  createHash("sha256").update(`${tenantId}:${phone}`).digest("hex");

// All Contact creation and deletion uses this short transaction lock. A
// job that began before deletion must either commit first and be deleted,
// or read the committed barrier before it can file anything.
const lockContact = async (tx: Transaction, tenantId: string, phone: string) => {
  const addressHash = contactAddressHash(tenantId, phone);
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`contact:${addressHash}`}, 0))`,
  );
  const [marker] = await tx
    .select({ deletedAt: contactDeletion.deletedAt })
    .from(contactDeletion)
    .where(
      and(eq(contactDeletion.tenantId, tenantId), eq(contactDeletion.addressHash, addressHash)),
    );
  return marker?.deletedAt ?? null;
};

// Meta timestamps have second precision. Suppress the ambiguous deletion
// second as well: a delayed old message is indistinguishable from a fresh
// one within that second, and must never restore erased data.
const predatesDeletion = (deletedAt: Date | null, occurredAt: Date, receivedAt?: Date) =>
  deletedAt !== null &&
  (occurredAt <= deletedAt || (receivedAt !== undefined && receivedAt <= deletedAt));

export const createContactDeletion =
  (dependencies: { db: Database; notifier: Notifier; clock: Clock }) =>
  (scope: TenantScope, contactId: string) =>
    deleteContact({ ...dependencies, scope, contactId });

export type ContactDeletion = ReturnType<typeof createContactDeletion>;

// Only admitted events may create a Contact or advance a Conversation. This
// stays private so filing never re-locks or re-checks a partially filtered batch.
const fileConversation = async (
  tx: Transaction,
  route: ChannelRoute,
  phone: string,
  sentAt: Date,
  profileName: string | null,
) => {
  const [{ contactId }] = await tx
    .insert(contact)
    .values({ tenantId: route.tenantId, phone, profileName })
    .onConflictDoUpdate({
      target: [contact.tenantId, contact.phone],
      set: { profileName: sql`coalesce(excluded.profile_name, ${contact.profileName})` },
    })
    .returning({ contactId: contact.id });
  const [{ conversationId }] = await tx
    .insert(conversation)
    .values({
      tenantId: route.tenantId,
      channelId: route.channelId,
      contactId,
      lastMessageAt: sentAt,
    })
    .onConflictDoUpdate({
      target: [conversation.channelId, conversation.contactId],
      set: {
        lastMessageAt: sql`greatest(${conversation.lastMessageAt}, excluded.last_message_at)`,
      },
    })
    .returning({ conversationId: conversation.id });
  return conversationId;
};

// Owns the complete admission protocol and its short transaction. Event writers
// see only admitted events; deletion timestamps and lock ordering stay here.
// Passing an existing transaction uses a savepoint, keeping an echo's preceding
// wamid lock and this Contact lock held until the outer transaction commits.
export const withContactAdmission = <Event, Result>(
  db: Database,
  route: ChannelRoute,
  input: {
    phone: string;
    receivedAt?: Date;
    events: Event[];
    occurredAt: (event: Event) => Date;
  },
  record: (admitted: {
    tx: Transaction;
    events: Event[];
    addressHash: string;
    fileConversation: (profileName?: string | null) => Promise<string>;
  }) => Promise<Result>,
): Promise<Result | null> =>
  db.transaction(async (tx) => {
    // Share the Tenant row lock with cancellation/deletion. A job that already
    // resolved a Channel must still finish before cancellation or be refused.
    const [tenant] = await tx
      .select({ canceledAt: organization.canceledAt })
      .from(organization)
      .where(eq(organization.id, route.tenantId))
      .for("share");
    if (!tenant || tenant.canceledAt) return null;
    const deletedAt = await lockContact(tx, route.tenantId, input.phone);
    const events = input.events.filter(
      (event) => !predatesDeletion(deletedAt, input.occurredAt(event), input.receivedAt),
    );
    if (events.length === 0) return null;
    return record({
      tx,
      events,
      addressHash: contactAddressHash(route.tenantId, input.phone),
      fileConversation: (profileName = null) =>
        fileConversation(
          tx,
          route,
          input.phone,
          new Date(Math.max(...events.map((event) => input.occurredAt(event).getTime()))),
          profileName,
        ),
    });
  });

export const deleteContact = async ({
  db,
  scope,
  notifier,
  clock,
  contactId,
}: {
  db: Database;
  scope: TenantScope;
  notifier: Notifier;
  clock: Clock;
  contactId: string;
}) => {
  if (scope.role !== "owner") return { ok: false as const, error: "forbidden" as const };
  const deleted = await db.transaction(async (tx) => {
    const [found] = await tx
      .select({ phone: contact.phone })
      .from(contact)
      .where(and(eq(contact.id, contactId), eq(contact.tenantId, scope.tenantId)));
    if (!found) return false;
    await lockContact(tx, scope.tenantId, found.phone);
    // A competing deletion may have removed this id while we waited. Never
    // erase changes belonging to a fresh Contact at the same address.
    const [current] = await tx
      .select({ id: contact.id })
      .from(contact)
      .where(and(eq(contact.id, contactId), eq(contact.tenantId, scope.tenantId)));
    if (!current) return false;
    const addressHash = contactAddressHash(scope.tenantId, found.phone);
    const wamids = tx
      .select({ wamid: message.wamid })
      .from(message)
      .innerJoin(conversation, eq(conversation.id, message.conversationId))
      .where(and(eq(conversation.contactId, contactId), eq(conversation.tenantId, scope.tenantId)));
    await tx
      .delete(messageChange)
      .where(
        and(
          eq(messageChange.tenantId, scope.tenantId),
          or(
            eq(messageChange.contactAddressHash, addressHash),
            inArray(messageChange.originalWamid, wamids),
          ),
        ),
      );
    const [removed] = await tx
      .delete(contact)
      .where(and(eq(contact.id, contactId), eq(contact.tenantId, scope.tenantId)))
      .returning({ id: contact.id });
    if (!removed) return false;
    const deletedAt = clock.now();
    await tx
      .insert(contactDeletion)
      .values({ tenantId: scope.tenantId, addressHash, deletedAt })
      .onConflictDoUpdate({
        target: [contactDeletion.tenantId, contactDeletion.addressHash],
        set: { deletedAt },
      });
    return true;
  });
  if (!deleted) return { ok: false as const, error: "not_found" as const };
  await notifyInbox(notifier, scope.tenantId, { contactId });
  return { ok: true as const };
};
