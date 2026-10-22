import { useId } from "react";
import { ContactDetailsForm } from "@/components/inbox/contact-details-form";
import { DeleteContactButton } from "@/components/inbox/delete-contact-button";
import { formatContactPhone } from "@/modules/conversations/hooks";
import type { RouterOutput } from "@/trpc/routers/_app";

type Contact = RouterOutput["conversations"]["get"]["contact"];

export function ContactPanel({
  contact,
  canDeleteContacts,
  onDeleted,
}: {
  contact: Contact;
  canDeleteContacts: boolean;
  onDeleted: () => void;
}) {
  const headingId = useId();
  return (
    <aside
      aria-labelledby={headingId}
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto border-l border-border p-4"
    >
      <h2 id={headingId} className="font-semibold">
        Contato
      </h2>
      <dl className="flex flex-col gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Telefone</dt>
          <dd>{formatContactPhone(contact.phone)}</dd>
        </div>
      </dl>
      <ContactDetailsForm key={`details-${contact.id}`} contact={contact} />
      {canDeleteContacts && (
        <DeleteContactButton key={`delete-${contact.id}`} contact={contact} onDeleted={onDeleted} />
      )}
    </aside>
  );
}
