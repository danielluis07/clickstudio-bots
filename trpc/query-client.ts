import {
  defaultShouldDehydrateQuery,
  MutationCache,
  QueryClient,
} from "@tanstack/react-query";
import superjson from "superjson";

export function makeQueryClient(onMutationError?: (error: Error) => void) {
  return new QueryClient({
    // Browser callers inject feedback; the RSC cache stays independent of UI.
    mutationCache: new MutationCache({
      onError: onMutationError,
    }),
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      dehydrate: {
        shouldRedactErrors: () => false,
        serializeData: superjson.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
      hydrate: {
        deserializeData: superjson.deserialize,
      },
    },
  });
}
