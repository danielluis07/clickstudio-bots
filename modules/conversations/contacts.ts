import { and, eq, isNull, lt, or } from "drizzle-orm";
import type { Database } from "@/db/database";
import { contact } from "@/db/schema";
import type { ChannelRoute } from "@/modules/channels";
import { createConversationRepository } from "@/modules/conversations/repository";
import type { TenantScope } from "@/modules/tenancy";
import { notifyInbox, type Notifier } from "@/platform/notifier";

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
export type AppContact = { phone: string; name: string | null; changedAt: Date };

// Keeps the app's name, or its removal, on the Contact with this phone under
// the route's Tenant. Only people who have written to the business are
// Contacts, so the rest of the app's contacts are not stored. The name a
// Member gave in the dashboard is never touched. Returns the Contact's id
// when it changed.
export const recordAppContact = async (db: Database, route: ChannelRoute, change: AppContact) => {
  const [changed] = await db.update(contact)
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
};
