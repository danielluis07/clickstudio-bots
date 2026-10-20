import { eq } from "drizzle-orm";
import type { Database } from "@/db/database";
import { channel } from "@/db/schema";
import type { TenantScope } from "@/modules/tenancy";

// Explicit projection: neither RSC nor action results can serialize credentials.
const channelSummary = {
  id: channel.id,
  wabaId: channel.wabaId,
  phoneNumberId: channel.phoneNumberId,
  displayPhoneNumber: channel.displayPhoneNumber,
  botEnabled: channel.botEnabled,
  subscriptionStatus: channel.subscriptionStatus,
  subscriptionFields: channel.subscriptionFields,
  subscriptionAttemptedAt: channel.subscriptionAttemptedAt,
  subscriptionError: channel.subscriptionError,
};

export const createChannelRepository = (db: Database, scope: TenantScope) => ({
  async getChannel() {
    const [found] = await db.select(channelSummary).from(channel)
      .where(eq(channel.tenantId, scope.tenantId)).limit(1);
    return found ?? null;
  },
  async insert(input: Pick<typeof channel.$inferInsert, "wabaId" | "phoneNumberId" | "displayPhoneNumber" | "credential" | "subscriptionFields">) {
    const [created] = await db.insert(channel).values({ ...input, tenantId: scope.tenantId })
      .onConflictDoNothing().returning({ id: channel.id });
    return created ?? null;
  },
  async getCredential() {
    const [found] = await db.select({
      tenantId: channel.tenantId, wabaId: channel.wabaId,
      phoneNumberId: channel.phoneNumberId, credential: channel.credential,
    }).from(channel).where(eq(channel.tenantId, scope.tenantId)).limit(1);
    return found ?? null;
  },
  async recordSubscription(input: {
    subscriptionStatus: "subscribed" | "failed";
    subscriptionAttemptedAt: Date;
    subscriptionError: string | null;
  }) {
    await db.update(channel).set(input).where(eq(channel.tenantId, scope.tenantId));
  },
});

declare const channelRouteBrand: unique symbol;

// Proof that a signed Meta event addressed this Channel. Only
// resolveChannelPhoneNumber can create one, so inbound data is never filed
// under a Tenant id taken from anywhere else.
export type ChannelRoute = {
  readonly channelId: string;
  readonly tenantId: string;
  readonly [channelRouteBrand]: true;
};

// Trusted webhook routing is intentionally separate from Member-scoped reads.
// It exposes only routing ids, never credentials or a browser-selectable scope.
export const resolveChannelPhoneNumber = async (db: Database, phoneNumberId: string): Promise<ChannelRoute | null> => {
  const [found] = await db.select({ channelId: channel.id, tenantId: channel.tenantId })
    .from(channel).where(eq(channel.phoneNumberId, phoneNumberId)).limit(1);
  return found ? (found as ChannelRoute) : null;
};
