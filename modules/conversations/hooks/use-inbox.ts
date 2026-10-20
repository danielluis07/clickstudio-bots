import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useEffect, useState, type SubmitEvent } from "react";
import { useTRPC } from "@/trpc/client";
import type { ConversationDetails } from "@/modules/conversations/repository";

export const useConversationList = () => {
  const { conversations: queries } = useTRPC();
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

export const useConversation = (id: string) => {
  const { conversations: queries } = useTRPC();
  return {
    conversation: useQuery(queries.get.queryOptions({ id })),
    messages: useQuery(queries.messages.queryOptions({ conversationId: id })),
  };
};

export const useContactEditor = (contact: ConversationDetails["contact"], conversationId: string) => {
  const { conversations: queries } = useTRPC();
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
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    mutation.mutate({ id: contact.id, name, phone });
  };
  const errors = mutation.error?.data?.zodError?.properties;
  return {
    name, setName, phone, setPhone, submit,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    fieldErrors: {
      name: errors?.name?.errors.join(" "),
      phone: errors?.phone?.errors.join(" "),
    },
  };
};
