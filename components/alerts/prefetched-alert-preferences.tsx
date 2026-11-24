import { AlertPreferences } from "@/components/alerts/alert-preferences";
import { HydrateClient, prefetch, trpc } from "@/trpc/server";

// Loads the Member's Alert preferences before the first render. Rendered only
// after the page's guard.
export async function PrefetchedAlertPreferences() {
  await prefetch(trpc.alerts.preferences.queryOptions());

  return (
    <HydrateClient>
      <AlertPreferences />
    </HydrateClient>
  );
}
