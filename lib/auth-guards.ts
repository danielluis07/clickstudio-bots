import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { resolveTenantScope } from "@/db/tenant-scope";
import { auth } from "@/lib/auth";
import { signInPath } from "@/lib/auth-redirects";

// The authoritative checks behind `proxy.ts`, which only looks for a cookie.
// Call one at the top of every protected page (its segment needs a
// `loading.tsx`) and in every Server Action; never rely on a layout, which
// does not re-run on navigation.

// One session lookup per request, however many components ask for it.
export const getCurrentSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);

export const requireAuth = async () => {
  const session = await getCurrentSession();
  if (!session) redirect(signInPath);
  return session;
};

// Non-admins get a 404 so the surface is not advertised.
export const requireAdmin = async () => {
  const session = await requireAuth();
  if (session.user.role !== "admin") notFound();
  return session;
};

// Session plus authorized membership. The Tenant comes from the server-side
// session and is re-checked against `member`, never taken from the request.
export const requireTenantScope = async () => {
  const { user, session } = await requireAuth();
  const scope = await resolveTenantScope(db, {
    userId: user.id,
    activeTenantId: session.activeOrganizationId,
  });
  if (scope) return scope;
  if (user.role === "admin") redirect("/admin");
  notFound();
};
