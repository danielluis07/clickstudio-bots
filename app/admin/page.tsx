import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminTenants } from "@/components/admin/admin-tenants";
import { ContentSkeleton } from "@/components/app-shell/content-skeleton";

export const metadata: Metadata = {
  title: "Administração",
  robots: { index: false },
};

export default function AdminPage() {
  return (
    <Suspense fallback={<ContentSkeleton />}>
      <AdminTenants />
    </Suspense>
  );
}
