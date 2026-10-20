import { ContactNameForm } from "@/components/inbox/contact-name-form";
import { formatContactPhone } from "@/modules/conversations/hooks";
import type { RouterOutput } from "@/trpc/routers/_app";

type Contact = RouterOutput["conversations"]["get"]["contact"];

export function ContactPanel({ contact }: { contact: Contact }) {
  return (
    <aside aria-labelledby="contato" className="flex min-h-0 flex-col gap-6 overflow-y-auto border-l border-border p-4">
      <h2 id="contato" className="font-semibold">Contato</h2>
      <dl className="flex flex-col gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Telefone</dt>
          <dd>{formatContactPhone(contact.phone)}</dd>
        </div>
        {contact.profileName && (
          <div>
            <dt className="text-muted-foreground">Nome no WhatsApp</dt>
            <dd className="wrap-break-word">{contact.profileName}</dd>
          </div>
        )}
      </dl>
      <ContactNameForm key={contact.id} contact={contact} />
    </aside>
  );
}
