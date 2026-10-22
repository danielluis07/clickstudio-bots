"use client";

import { Button } from "@/components/ui/button";
import { contactDisplayName, useDeleteContact } from "@/modules/conversations/hooks";
import { useConfirm } from "@/providers/confirm-provider";
import type { RouterOutput } from "@/trpc/routers/_app";

type Contact = RouterOutput["conversations"]["get"]["contact"];

export function DeleteContactButton({
  contact,
  onDeleted,
}: {
  contact: Contact;
  onDeleted: () => void;
}) {
  const { confirm } = useConfirm();
  const deletion = useDeleteContact(onDeleted);

  return (
    <div className="mt-auto flex flex-col gap-2">
      <Button
        type="button"
        variant="destructive"
        onClick={() =>
          confirm({
            title: `Excluir ${contactDisplayName(contact)}?`,
            message:
              "O contato, suas conversas, transcrições e dados capturados serão excluídos permanentemente. Exclua também a conversa no aplicativo WhatsApp Business. Uma nova mensagem poderá criar um novo contato.",
            action: async () => {
              await deletion.mutateAsync({ contactId: contact.id });
            },
          })
        }
      >
        Excluir contato
      </Button>
      {deletion.isError && (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível excluir o contato. Tente novamente.
        </p>
      )}
    </div>
  );
}
