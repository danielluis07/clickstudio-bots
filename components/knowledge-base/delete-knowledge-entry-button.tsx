"use client";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/providers/confirm-provider";

type DeleteKnowledgeEntryButtonProps = {
  entryId: string;
  entryTitle: string;
  disabled: boolean;
  onDelete: (entryId: string) => Promise<void>;
};

export function DeleteKnowledgeEntryButton({
  entryId,
  entryTitle,
  disabled,
  onDelete,
}: DeleteKnowledgeEntryButtonProps) {
  const { confirm } = useConfirm();

  return (
    <Button
      type="button"
      variant="destructive"
      size="sm"
      disabled={disabled}
      onClick={() =>
        confirm({
          title: `Excluir “${entryTitle}”?`,
          message:
            "O item sai da base de conhecimento e o Bot deixa de usá-lo a partir da próxima resposta. Não é possível desfazer.",
          action: () => onDelete(entryId),
        })
      }
    >
      Excluir
    </Button>
  );
}
