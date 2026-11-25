import { hashPassword } from "better-auth/crypto";
import { inArray, type SQL } from "drizzle-orm";
import type { Database } from "@/db/database";
import { memberActivity, organization, user } from "@/db/schema";
import { resolveChannelPhoneNumber } from "@/modules/channels";
import { createUserRepository } from "@/modules/identity";
import { env } from "@/platform/env";

/** Local `.env` holds the dev branch; a local APP_URL is the sign this is not a deployment. */
export function refuseNonLocalSeed() {
  if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(env.APP_URL).hostname)) {
    console.error(`Refusing to seed: APP_URL (${env.APP_URL}) is not local.`);
    process.exit(1);
  }
}

/** Deletes the Tenants matching `tenantWhere` and the users matching `userWhere`. */
export async function deleteSeededTenants(
  db: Database,
  { tenantWhere, userWhere }: { tenantWhere: SQL; userWhere: SQL },
) {
  const stale = await db.select({ id: organization.id }).from(organization).where(tenantWhere);
  const staleIds = stale.map(({ id }) => id);
  if (staleIds.length > 0) {
    await db.delete(organization).where(inArray(organization.id, staleIds));
    // Allowed by the append-only trigger now that the Tenants are gone.
    await db.delete(memberActivity).where(inArray(memberActivity.tenantId, staleIds));
  }
  await db.delete(user).where(userWhere);
}

/** Creates verified users who all sign in with `password`, hashed once. */
export async function createUserFactory(db: Database, password: string) {
  const users = createUserRepository(db);
  const passwordHash = await hashPassword(password);
  return (input: { name: string; email: string }) =>
    users.createWithPassword({ ...input, emailVerified: true, passwordHash });
}

/** The route of a seeded Channel, found by its phone number id. */
export async function requireChannelRoute(db: Database, phoneNumberId: string) {
  const route = await resolveChannelPhoneNumber(db, phoneNumberId);
  if (!route) throw new Error(`No Channel route for phone number ${phoneNumberId}`);
  return route;
}
