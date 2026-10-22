"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import type { SandboxMessage } from "@/modules/bot/sandbox";
import { useTRPC } from "@/trpc/client";

export type SandboxChatMessage = SandboxMessage & { id: string; handoff?: boolean };

const errorMessages: Record<string, string> = {
  UNAUTHORIZED: "Sua sessão expirou. Entre novamente para continuar.",
  FORBIDDEN: "Apenas o responsável pelo negócio pode testar o Bot.",
  BAD_REQUEST: "Não foi possível enviar o teste. Escreva uma mensagem de até 4.096 caracteres.",
  PRECONDITION_FAILED: "O teste do Bot está indisponível no momento. Tente novamente mais tarde.",
};

export const useBotSandbox = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const status = useQuery(trpc.sandbox.status.queryOptions());
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<SandboxChatMessage[]>([]);
  const send = useMutation(
    trpc.sandbox.respond.mutationOptions({
      onMutate: (input) => {
        const pendingMessageId = crypto.randomUUID();
        setMessages((previous) => [
          ...previous,
          { id: pendingMessageId, author: "contact", text: input.text },
        ]);
        return { pendingMessageId };
      },
      onError: (_error, _input, context) => {
        setMessages((previous) => previous.filter(({ id }) => id !== context?.pendingMessageId));
      },
      onSuccess: ({ outcome }) => {
        setText("");
        setMessages((previous) => [
          ...previous,
          ...(outcome.kind === "nothing_to_answer"
            ? []
            : [
                {
                  id: crypto.randomUUID(),
                  author: "bot" as const,
                  text: outcome.reply,
                  handoff: outcome.kind === "handoff",
                },
              ]),
        ]);
      },
      onSettled: () =>
        Promise.all([
          queryClient.invalidateQueries(trpc.sandbox.status.pathFilter()),
          queryClient.invalidateQueries(trpc.bot.status.pathFilter()),
        ]),
    }),
  );

  const allowance = status.data?.allowance;
  const capReached =
    send.error?.data?.code === "TOO_MANY_REQUESTS" ||
    (allowance !== undefined && allowance.used >= allowance.limit);
  // Keep the composer usable after midnight: the server decides the cap and
  // status is refreshed on focus and after every attempt.
  const disabled = status.isPending || status.isError || !status.data?.available || send.isPending;
  const canSend = !disabled && text.trim().length > 0;
  const submit = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!canSend) return;
    send.mutate({
      text,
      history: messages.slice(-20).map(({ author, text }) => ({ author, text })),
    });
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  };

  const error = send.error
    ? (errorMessages[send.error.data?.code ?? ""] ??
      "Não foi possível testar o Bot. Tente novamente.")
    : null;

  return {
    text,
    setText,
    submit,
    keyDown,
    disabled,
    canSend,
    allowance,
    capReached,
    error,
    loading: status.isPending,
    loadFailed: status.isError,
    retry: () => status.refetch(),
    available: status.data?.available,
    sending: send.isPending,
    messages,
  };
};
