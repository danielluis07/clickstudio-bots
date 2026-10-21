"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { useTRPC } from "@/trpc/client";

// Whether WhatsApp still lets the dashboard reply, turning false on screen
// when the window closes. The server refuses late sends regardless.
const useServiceWindowOpen = (closesAt: Date | null) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!closesAt) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(closesAt.getTime() - Date.now(), 0));
    return () => clearTimeout(timer);
  }, [closesAt]);

  return closesAt !== null && closesAt.getTime() > now;
};

export const useReplyComposer = ({ conversationId, serviceWindowClosesAt }: {
  conversationId: string;
  serviceWindowClosesAt: Date | null;
}) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const windowOpen = useServiceWindowOpen(serviceWindowClosesAt);
  const [text, setText] = useState("");

  // A failed send is stored too, and a refusal may mean the window closed, so
  // the Conversation is refetched whatever the outcome.
  const send = useMutation(trpc.replies.send.mutationOptions({
    onSuccess: () => setText(""),
    onSettled: () => Promise.all([
      queryClient.invalidateQueries(trpc.conversations.messages.pathFilter()),
      queryClient.invalidateQueries(trpc.conversations.get.pathFilter()),
      queryClient.invalidateQueries(trpc.conversations.list.pathFilter()),
    ]),
  }));

  // The server's clock decides; it may close the window before this one does.
  const windowClosed = !windowOpen || send.error?.message === "window_closed";
  const canSend = !windowClosed && text.trim() !== "" && !send.isPending;

  const changeText = (value: string) => {
    setText(value);
    send.reset();
  };

  const submit = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (canSend) send.mutate({ conversationId, text });
  };

  // Enter sends and Shift+Enter starts a new line, as in WhatsApp Web.
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  };

  return { text, changeText, submit, keyDown, windowClosed, canSend, sending: send.isPending, failed: send.isError && !windowClosed };
};
