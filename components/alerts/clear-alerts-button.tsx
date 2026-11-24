"use client";

import { Button } from "@/components/ui/button";
import { useClearAlerts } from "@/modules/conversations/hooks";
import { useConfirm } from "@/providers/confirm-provider";

export function ClearAlertsButton() {
  const { confirm } = useConfirm();
  const { mutateAsync: clear } = useClearAlerts();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() =>
        confirm({
          title: "Limpar todos os alertas?",
          message:
            "Seus alertas, lidos ou não, são excluídos. Os dos outros membros e as conversas não mudam.",
          action: async () => {
            await clear();
          },
        })
      }
    >
      Limpar tudo
    </Button>
  );
}
