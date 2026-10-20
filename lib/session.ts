import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { resolveTenantScope } from "@/db/tenant-scope";
import { auth } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/platform-admin";

const getSession = async () =>
  auth.api.getSession({ headers: await headers() });

export const requireSession = async () => {
  const session = await getSession();
  if (!session) redirect("/entrar");
  return session;
};

// Authorization is checked on the server for every request; a hidden link is
// not access control. Non-admins get a 404 so the surface is not advertised.
export const requirePlatformAdmin = async () => {
  const { user } = await requireSession();
  if (!(await isPlatformAdmin(db, user.id))) notFound();
  return user;
};

export const requireTenantScope = async () => {
  const { user, session } = await requireSession();
  const scope = await resolveTenantScope(db, {
    userId: user.id,
    activeTenantId: session.activeOrganizationId,
  });
  if (scope) return scope;
  if (await isPlatformAdmin(db, user.id)) redirect("/admin");
  notFound();
};
