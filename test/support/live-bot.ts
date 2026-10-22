import type { Database } from "@/db/database";
import { channel, member, organization, user } from "@/db/schema";
import { resolveTenantScope } from "@/modules/tenancy";
import { resolveChannelPhoneNumber } from "@/modules/channels";
import { createTestClock } from "@/test/support/clock";

export const seedLiveBot = async (db: Database) => {
  const suffix = crypto.randomUUID();
  const tenantId = `tenant-${suffix}`;
  const userId = `owner-${suffix}`;
  await db.insert(user).values({ id: userId, name: "Owner", email: `${suffix}@example.com` });
  await db.insert(organization).values({ id: tenantId, name: "Barbearia", slug: suffix });
  await db.insert(member).values({ organizationId: tenantId, userId, role: "owner" });
  await db.insert(channel).values({
    tenantId,
    wabaId: `waba-${suffix}`,
    phoneNumberId: suffix,
    displayPhoneNumber: "+55 11 99999-0000",
    credential: { keyVersion: "v1", iv: "", ciphertext: "", tag: "" },
    subscriptionFields: [],
    subscriptionStatus: "subscribed",
  });
  return {
    phoneNumberId: suffix,
    scope: (await resolveTenantScope(db, { userId }))!,
    route: (await resolveChannelPhoneNumber(db, suffix))!,
    clock: createTestClock(new Date("2026-10-22T12:00:00Z")),
  };
};
