"use client";
// ^-- to make sure we can mount the Provider from a server component
import { QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import { useState } from "react";
import { makeQueryClient } from "@/trpc/query-client";
import type { AppRouter } from "@/server/trpc/router";
import superjson from "superjson";
import { toast } from "@/components/ui/toast";
import { mutationErrorMessage } from "@/trpc/error-copy";
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
export function TRPCReactProvider(
  props: Readonly<{
    children: React.ReactNode;
  }>,
) {
  // The inbox keys this provider by Tenant and Member. A new authorization
  // context gets a fresh cache instead of another Member's previous data.
  const [queryClient] = useState(() => makeQueryClient((error) => {
    const message = mutationErrorMessage(error);
    if (message) toast.add({ type: "error", title: message });
  }));
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          transformer: superjson,
          url: "/api/trpc",
        }),
      ],
    }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {props.children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
