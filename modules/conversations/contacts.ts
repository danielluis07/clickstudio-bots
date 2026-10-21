import type { Database } from "@/db/database";
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
