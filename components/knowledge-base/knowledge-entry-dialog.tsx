"use client";

import { KnowledgeEntryForm } from "@/components/knowledge-base/knowledge-entry-form";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";
import {
  knowledgeEntryLabels,
  type KnowledgeEntryDraft,
  type KnowledgeEntryTarget,
} from "@/modules/knowledge-base/hooks";
import { useConfirm } from "@/providers/confirm-provider";

export function KnowledgeEntryDialog({
  target,
  draft,
  pending,
  error,
  otherEntriesSize,
  cap,
  titleMaxLength,
  onChange,
  onSubmit,
  onClose,
  onDiscard,
}: {
  target: KnowledgeEntryTarget;
  draft: KnowledgeEntryDraft;
  pending: boolean;
  error?: string;
  otherEntriesSize: number;
  cap: number;
  titleMaxLength: number;
  onChange: (draft: KnowledgeEntryDraft) => void;
  onSubmit: (draft: KnowledgeEntryDraft) => void;
  onClose: () => void;
  onDiscard: () => void;
}) {
  const labels = knowledgeEntryLabels[target.kind];
  const { confirm } = useConfirm();

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>
            {target.entry
              ? target.kind === "faq"
                ? "Editar pergunta"
                : "Editar seção"
              : labels.add}
          </DialogTitle>
          <DialogDescription>
            As alterações salvas ficam disponíveis para o Bot na próxima resposta. Fechar mantém os
            campos preenchidos enquanto você estiver nesta página.
          </DialogDescription>
        </DialogHeader>
        <DialogClose
          disabled={pending}
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-2 right-2"
            />
          }
        >
          <XIcon />
          <span className="sr-only">Fechar formulário</span>
        </DialogClose>
        <KnowledgeEntryForm
          kind={target.kind}
          editing={!!target.entry}
          draft={draft}
          pending={pending}
          error={error}
          otherEntriesSize={otherEntriesSize}
          cap={cap}
          titleMaxLength={titleMaxLength}
          onChange={onChange}
          onSubmit={onSubmit}
          onClose={onClose}
          onDiscard={() =>
            confirm({
              title: "Descartar alterações do formulário?",
              message: `Os campos não salvos de “${draft.title.trim() || labels.add}” serão descartados. O conteúdo salvo na base de conhecimento será mantido.`,
              action: onDiscard,
            })
          }
        />
      </DialogContent>
    </Dialog>
  );
}
