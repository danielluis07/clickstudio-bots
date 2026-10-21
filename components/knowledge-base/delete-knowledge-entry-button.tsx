"use client";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/providers/confirm-provider";
import { deleteKnowledgeEntryAction } from "@/server/actions/knowledge-base";

type DeleteKnowledgeEntryButtonProps = {
  entryId: string;
  entryTitle: string;
};

export function DeleteKnowledgeEntryButton({ entryId, entryTitle }: DeleteKnowledgeEntryButtonProps) {
  const { confirm } = useConfirm();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() =>
        confirm({
          title: `Excluir “${entryTitle}”?`,
          message:
            "O item sai da base de conhecimento e o Bot deixa de usá-lo a partir da próxima resposta. Não é possível desfazer.",
          action: () => deleteKnowledgeEntryAction(entryId),
        })
      }>
      Excluir
    </Button>
  );
}
