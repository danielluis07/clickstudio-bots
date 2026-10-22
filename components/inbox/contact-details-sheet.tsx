import { ContactPanel } from "@/components/inbox/contact-panel";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { contactDisplayName } from "@/modules/conversations/hooks";
import type { RouterOutput } from "@/trpc/routers/_app";

export function ContactDetailsSheet({
  contact,
  canDeleteContacts,
  onDeleted,
}: {
  contact: RouterOutput["conversations"]["get"]["contact"];
  canDeleteContacts: boolean;
  onDeleted: () => void;
}) {
  return (
    <Sheet>
      <SheetTrigger
        render={<Button type="button" variant="outline" size="sm" className="xl:hidden" />}
      >
        Contato
      </SheetTrigger>
      <SheetContent
        className="data-[side=right]:w-full data-[side=right]:max-w-sm"
        showCloseButton={false}
      >
        <SheetHeader>
          <SheetTitle>Dados do contato</SheetTitle>
          <SheetDescription className="truncate">{contactDisplayName(contact)}</SheetDescription>
          <SheetClose render={<Button type="button" variant="outline" className="mt-3" />}>
            Voltar à conversa
          </SheetClose>
        </SheetHeader>
        <ContactPanel
          contact={contact}
          canDeleteContacts={canDeleteContacts}
          onDeleted={onDeleted}
        />
      </SheetContent>
    </Sheet>
  );
}
