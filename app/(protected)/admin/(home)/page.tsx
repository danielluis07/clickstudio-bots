import type { Metadata } from "next";
import { AdminTenants } from "@/components/admin/admin-tenants";
import { requireAdmin } from "@/server/auth/guards";

export const metadata: Metadata = {
  title: "Administração",
  robots: { index: false },
};

export default async function AdminPage() {
  const { user } = await requireAdmin();

  return <AdminTenants actorId={user.id} />;
}
