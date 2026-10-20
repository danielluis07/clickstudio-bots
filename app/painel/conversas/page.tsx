import type { Metadata } from "next";
import { Inbox } from "@/components/inbox/inbox";
import { requireTenantScope } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Caixa de entrada", robots: { index: false } };

export default async function InboxPage() {
  const scope = await requireTenantScope();
  return <Inbox scope={scope} />;
}
