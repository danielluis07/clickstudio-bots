import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import type { Database } from "@/db/database";
import { contact, contactDeletion, conversation, message, messageChange } from "@/db/schema";
import type { ChannelRoute } from "@/modules/channels";
import { createConversationRepository } from "@/modules/conversations/repository";
import type { TenantScope } from "@/modules/tenancy";
import type { Clock } from "@/platform/clock";
import { notifyInbox, type Notifier } from "@/platform/notifier";
import { contactAddressHash, lockContact, predatesDeletion } from "@/modules/conversations/contact-deletion";

export const deleteContact = async ({ db, scope, notifier, clock, contactId }: {
  db: Database;
  scope: TenantScope;
  notifier: Notifier;
  clock: Clock;
  contactId: string;
}) => {
  if (scope.role !== "owner") return { ok: false as const, error: "forbidden" as const };
  const deleted = await db.transaction(async (tx) => {
    const [found] = await tx.select({ phone: contact.phone }).from(contact)
      .where(and(eq(contact.id, contactId), eq(contact.tenantId, scope.tenantId)));
    if (!found) return false;
    await lockContact(tx, scope.tenantId, found.phone);
    // A competing deletion may have removed this id while we waited. Never
    // erase changes belonging to a fresh Contact at the same address.
    const [current] = await tx.select({ id: contact.id }).from(contact)
      .where(and(eq(contact.id, contactId), eq(contact.tenantId, scope.tenantId)));
    if (!current) return false;
    const wamids = tx.select({ wamid: message.wamid }).from(message)
      .innerJoin(conversation, eq(conversation.id, message.conversationId))
      .where(and(eq(conversation.contactId, contactId), eq(conversation.tenantId, scope.tenantId)));
    await tx.delete(messageChange).where(and(
      eq(messageChange.tenantId, scope.tenantId), or(
        eq(messageChange.contactAddressHash, contactAddressHash(scope.tenantId, found.phone)),
        inArray(messageChange.originalWamid, wamids),
      ),
    ));
    const [removed] = await tx.delete(contact).where(and(eq(contact.id, contactId), eq(contact.tenantId, scope.tenantId)))
      .returning({ id: contact.id });
    if (!removed) return false;
    const deletedAt = clock.now();
    await tx.insert(contactDeletion).values({
      tenantId: scope.tenantId, addressHash: contactAddressHash(scope.tenantId, found.phone), deletedAt,
    }).onConflictDoUpdate({
      target: [contactDeletion.tenantId, contactDeletion.addressHash], set: { deletedAt },
    });
    return true;
  });
  if (!deleted) return { ok: false as const, error: "not_found" as const };
  await notifyInbox(notifier, scope.tenantId, { contactId });
  return { ok: true as const };
};

export const renameContact = async ({ db, scope, notifier, contactId, name }: {
  db: Database;
  scope: TenantScope;
  notifier: Notifier;
  contactId: string;
  name: string;
}) => {
  const renamed = await createConversationRepository(db, scope).renameContact(contactId, name);
  if (renamed) await notifyInbox(notifier, scope.tenantId, { contactId });
  return renamed;
};

// A Contact as saved in the WhatsApp Business app's contacts: a name when
// added or edited there, null once removed.
export type AppContact = { phone: string; name: string | null; changedAt: Date; receivedAt?: Date };

// Keeps the app's name, or its removal, on the Contact with this phone under
// the route's Tenant. Only people who have written to the business are
// Contacts, so the rest of the app's contacts are not stored. The name a
// Member gave in the dashboard is never touched. Returns the Contact's id
// when it changed.
export const recordAppContact = (db: Database, route: ChannelRoute, change: AppContact) => db.transaction(async (tx) => {
  const deletedAt = await lockContact(tx, route.tenantId, change.phone);
  if (predatesDeletion(deletedAt, change.changedAt, change.receivedAt)) return null;
  const [changed] = await tx.update(contact)
    .set({ appName: change.name, appNameChangedAt: change.changedAt })
    .where(and(
      eq(contact.tenantId, route.tenantId),
      eq(contact.phone, change.phone),
      // Only a change newer than the one applied counts, so events applied in
      // any order end at the latest.
      or(isNull(contact.appNameChangedAt), lt(contact.appNameChangedAt, change.changedAt)),
    ))
    .returning({ id: contact.id });
  return changed?.id ?? null;
});
