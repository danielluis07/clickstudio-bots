"use client";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/providers/confirm-provider";
import { removeMemberAction } from "@/server/actions/members";

type RemoveMemberButtonProps = {
  memberId: string;
  memberName: string;
};

export function RemoveMemberButton({ memberId, memberName }: RemoveMemberButtonProps) {
  const { confirm } = useConfirm();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() =>
        confirm({
          title: `Remover ${memberName}?`,
          message:
            "O acesso ao painel termina na hora e a pessoa é desconectada. A conta e os dados de acesso são excluídos, a menos que ela faça parte de outro negócio.",
          action: () => removeMemberAction(memberId),
        })
      }>
      Remover
    </Button>
  );
}
