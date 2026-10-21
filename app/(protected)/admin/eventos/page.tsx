import type { Metadata } from "next";
import { FailedInboxEvents } from "@/components/admin/failed-inbox-events";
import { requireAdmin } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Eventos com falha", robots: { index: false } };

export default async function FailedInboxEventsPage({ searchParams }: { searchParams: Promise<{ pagina?: string | string[] }> }) {
  const { user } = await requireAdmin();
  return <FailedInboxEvents actorId={user.id} page={(await searchParams).pagina} />;
}
