"use client";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/providers/confirm-provider";
import { cancelInvitationAction } from "@/server/actions/members";

type CancelInvitationButtonProps = {
  invitationId: string;
  invitationEmail: string;
};

export function CancelInvitationButton({
  invitationId,
  invitationEmail,
}: CancelInvitationButtonProps) {
  const { confirm } = useConfirm();

  function handleCancelInvitation() {
    confirm({
      title: `Cancelar o convite para ${invitationEmail}?`,
      message: "O link do convite deixará de funcionar. Você poderá enviar um novo convite depois.",
      action: () => cancelInvitationAction(invitationId),
    });
  }

  return (
    <Button type="button" variant="ghost" size="sm" onClick={handleCancelInvitation}>
      Cancelar convite
    </Button>
  );
}
