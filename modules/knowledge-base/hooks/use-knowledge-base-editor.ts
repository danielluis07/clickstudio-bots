"use client";

import { useRef, useState, useTransition } from "react";
import type { KnowledgeEntrySummary } from "@/modules/knowledge-base/editor";
import type { KnowledgeEntryKind } from "@/modules/knowledge-base/kinds";

export type KnowledgeEntryDraft = { title: string; body: string };
export type KnowledgeEntryTarget = { kind: KnowledgeEntryKind; entry?: KnowledgeEntrySummary };

type MutationResult = { status: "idle" } | { status: "error" | "success"; message: string };
export type KnowledgeBaseActions = {
  save: (previous: MutationResult, formData: FormData) => Promise<MutationResult>;
  remove: (entryId: string) => Promise<MutationResult>;
};
const targetKey = ({ kind, entry }: KnowledgeEntryTarget) => entry?.id ?? `new:${kind}`;
const initialDraft = ({ entry }: KnowledgeEntryTarget): KnowledgeEntryDraft => ({
  title: entry?.title ?? "",
  body: entry?.body ?? "",
});

export const useKnowledgeBaseEditor = ({
  entries,
  save,
  remove,
  rethrow,
}: KnowledgeBaseActions & {
  entries: KnowledgeEntrySummary[];
  // The UI supplies Next.js control-flow handling, keeping this hook browser-safe.
  rethrow: (error: unknown) => void;
}) => {
  const [pending, startSaving] = useTransition();
  const locked = useRef(false);
  const [dialog, setDialog] = useState<KnowledgeEntryTarget | null>(null);
  const [drafts, setDrafts] = useState<Record<string, KnowledgeEntryDraft>>({});
  const [failure, setFailure] = useState<{
    message: string;
    target?: KnowledgeEntryTarget;
  } | null>(null);
  const open = (target: KnowledgeEntryTarget) => {
    if (!locked.current && !pending) {
      setFailure(null);
      setDialog(target);
    }
  };
  const close = () => {
    if (!locked.current && !pending) setDialog(null);
  };
  const clearDraft = (target: KnowledgeEntryTarget) =>
    setDrafts((current) => {
      const next = { ...current };
      delete next[targetKey(target)];
      return next;
    });

  const perform = async (action: () => Promise<MutationResult>, target?: KnowledgeEntryTarget) => {
    setFailure(null);
    try {
      const result = await action();
      if (result.status !== "success") {
        setFailure({
          message:
            result.status === "error"
              ? result.message
              : "Não foi possível concluir a alteração. Tente novamente.",
          target,
        });
      } else if (target) {
        clearDraft(target);
        setDialog(null);
      }
    } catch (error) {
      rethrow(error);
      setFailure({
        message: "Não foi possível concluir a alteração. Verifique sua conexão e tente novamente.",
        target,
      });
    } finally {
      locked.current = false;
    }
  };

  const submit = (text: KnowledgeEntryDraft) => {
    if (!dialog || locked.current || pending) return;
    locked.current = true;
    const target = dialog;
    const formData = new FormData();
    formData.set("title", text.title);
    formData.set("body", text.body);
    if (target.entry) formData.set("entryId", target.entry.id);
    else formData.set("kind", target.kind);
    startSaving(() => perform(() => save({ status: "idle" }, formData), target));
  };

  // ConfirmProvider invokes this inside its transition and awaits the promise.
  const deleteEntry = async (entryId: string) => {
    if (locked.current || pending) return;
    locked.current = true;
    await perform(() => remove(entryId));
  };

  return {
    entries,
    used: entries.reduce((total, entry) => total + entry.size, 0),
    pending,
    dialog,
    draft: dialog ? (drafts[targetKey(dialog)] ?? initialDraft(dialog)) : null,
    failure,
    open,
    close,
    submit,
    deleteEntry,
    updateDraft: (draft: KnowledgeEntryDraft) => {
      if (dialog && !locked.current && !pending)
        setDrafts((current) => ({ ...current, [targetKey(dialog)]: draft }));
    },
    discard: () => {
      if (!dialog || locked.current || pending) return;
      clearDraft(dialog);
      if (failure?.target && targetKey(failure.target) === targetKey(dialog)) setFailure(null);
      close();
    },
    retry: () => {
      if (failure?.target) open(failure.target);
    },
  };
};
