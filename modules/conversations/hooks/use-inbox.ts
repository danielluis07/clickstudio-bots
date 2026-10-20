import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import type { useTRPC } from "@/trpc/client";

type InboxProcedures = ReturnType<typeof useTRPC>["conversations"];

export const useConversationList = (queries: InboxProcedures) => {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timeout);
  }, [search]);
  const query = useQuery({
    ...queries.list.queryOptions({ search: debouncedSearch }),
    placeholderData: keepPreviousData,
  });
  return { ...query, search, setSearch };
};

export const useConversation = (queries: InboxProcedures, id: string) => ({
  conversation: useQuery(queries.get.queryOptions({ id })),
  messages: useQuery(queries.messages.queryOptions({ conversationId: id })),
});

export const useContactEditor = (queries: InboxProcedures, contact: {
  id: string; name: string | null; phone: string;
}, conversationId: string) => {
  const queryClient = useQueryClient();
  const [name, setName] = useState(contact.name ?? "");
  const [phone, setPhone] = useState(contact.phone);
  const mutation = useMutation({
    ...queries.updateContact.mutationOptions(),
    onSuccess: async () => {
      setName(name.trim());
      setPhone(phone.replace(/\D/g, ""));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queries.list.pathKey() }),
        queryClient.invalidateQueries({ queryKey: queries.get.queryKey({ id: conversationId }) }),
      ]);
    },
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    mutation.mutate({ id: contact.id, name, phone });
  };
  return { name, setName, phone, setPhone, submit, mutation };
};
