import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import type { Database } from "@/db/database";
import { contact, conversation } from "@/db/schema";
import type { ChannelRoute } from "@/modules/channels";
import {
  contactDetailFields,
  contactDetailSchemas,
  type ContactDetailField,
  type ContactDetails,
} from "@/modules/conversations/contact-details";
import { createConversationRepository } from "@/modules/conversations/repository";
import type { TenantScope } from "@/modules/tenancy";
import { notifyInbox, type Notifier } from "@/platform/notifier";
import { withContactAdmission } from "@/modules/conversations/contact-deletion";

// A Member's edit of every detail at once, as typed in the Contact panel. A
// blank detail clears it; a blank name shows the WhatsApp name again.
export const updateContactDetails = async ({
  db,
  scope,
  notifier,
  contactId,
  details,
}: {
  db: Database;
  scope: TenantScope;
  notifier: Notifier;
  contactId: string;
  details: Record<ContactDetailField, string>;
}) => {
  const values = {} as ContactDetails;
  for (const field of contactDetailFields) {
    const text = details[field]?.trim() ?? "";
    const parsed = contactDetailSchemas[field].safeParse(text);
    if (text && !parsed.success) return { ok: false as const, error: "invalid" as const };
    values[field] = parsed.data ?? null;
  }
  const updated = await createConversationRepository(db, scope).updateContactDetails(
    contactId,
    values,
  );
  if (!updated) return { ok: false as const, error: "not_found" as const };
  await notifyInbox(notifier, scope.tenantId, { contactId });
  return { ok: true as const, contact: updated };
};

// A Contact as saved in the WhatsApp Business app's contacts: a name when
// added or edited there, null once removed.
export type AppContact = { phone: string; name: string | null; changedAt: Date; receivedAt?: Date };

// Keeps the app's name, or its removal, on the Contact with this phone under
// the route's Tenant. Only people who have written to the business are
// Contacts, so the rest of the app's contacts are not stored. The name a
// Member gave in the dashboard is never touched. Returns the Contact's id
// when it changed.
export const recordAppContact = (db: Database, route: ChannelRoute, change: AppContact) =>
  withContactAdmission(
    db,
    route,
    {
      phone: change.phone,
      receivedAt: change.receivedAt,
      events: [change],
      occurredAt: (event) => event.changedAt,
    },
    async ({ tx }) => {
      const [changed] = await tx
        .update(contact)
        .set({ appName: change.name, appNameChangedAt: change.changedAt })
        .where(
          and(
            eq(contact.tenantId, route.tenantId),
            eq(contact.phone, change.phone),
            // Only a change newer than the one applied counts, so events applied in
            // any order end at the latest.
            or(isNull(contact.appNameChangedAt), lt(contact.appNameChangedAt, change.changedAt)),
          ),
        )
        .returning({ id: contact.id });
      return changed?.id ?? null;
    },
  );

const contactDetailColumns = {
  name: contact.name,
  email: contact.email,
  city: contact.city,
  need: contact.need,
};

const noDetails: ContactDetails = { name: null, email: null, city: null, need: null };

// The Contact of a Conversation on the route's Channel, never another's.
const contactOfConversation = (db: Database, route: ChannelRoute, conversationId: string) =>
  and(
    eq(contact.tenantId, route.tenantId),
    inArray(
      contact.id,
      db
        .select({ id: conversation.contactId })
        .from(conversation)
        .where(
          and(
            eq(conversation.id, conversationId),
            eq(conversation.tenantId, route.tenantId),
            eq(conversation.channelId, route.channelId),
          ),
        ),
    ),
  );

// The details of a Bot turn's Contact; none when the Contact is gone.
export const readConversationContactDetails = async (
  db: Database,
  route: ChannelRoute,
  conversationId: string,
): Promise<ContactDetails> => {
  const [found] = await db
    .select(contactDetailColumns)
    .from(contact)
    .where(contactOfConversation(db, route, conversationId));
  return found ?? noDetails;
};

// Stores what the Bot captured on the turn's Contact, keeping the details it
// did not capture. Each value is checked again here, whoever validated it.
export const saveCapturedContactDetails = async ({
  db,
  route,
  notifier,
  conversationId,
  details,
}: {
  db: Database;
  route: ChannelRoute;
  notifier: Notifier;
  conversationId: string;
  details: Partial<ContactDetails>;
}) => {
  const values = Object.fromEntries(
    contactDetailFields.flatMap((field) => {
      const parsed = contactDetailSchemas[field].safeParse(details[field]);
      return parsed.success ? [[field, parsed.data]] : [];
    }),
  );
  if (!Object.keys(values).length) return;
  const [saved] = await db
    .update(contact)
    .set(values)
    .where(contactOfConversation(db, route, conversationId))
    .returning({ id: contact.id });
  if (saved) await notifyInbox(notifier, route.tenantId, { contactId: saved.id });
};
