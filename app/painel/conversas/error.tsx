"use client";

import { InboxError } from "@/components/inbox/inbox-error";

export default function InboxRouteError({ retry }: { error: unknown; retry: () => void }) {
  return <InboxError retry={retry} />;
}
