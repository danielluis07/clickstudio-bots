import { and, eq, gt } from "drizzle-orm";
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
  historySync: channel.historySync,
  createdAt: channel.createdAt,
};

type AppSync = "contactsSync" | "historySync";

export const createChannelRepository = (db: Database, scope: TenantScope) => ({
  async getChannel() {
    const [found] = await db.select(channelSummary).from(channel)
      .where(eq(channel.tenantId, scope.tenantId)).limit(1);
    return found ?? null;
  },
  // `createdAt` is when the Tenant onboarded, which starts Meta's sync window.
  async insert(input: Pick<typeof channel.$inferInsert, "wabaId" | "phoneNumberId" | "displayPhoneNumber" | "credential" | "subscriptionFields" | "createdAt">) {
    const [created] = await db.insert(channel).values({ ...input, tenantId: scope.tenantId })
      .onConflictDoNothing().returning({ id: channel.id });
    return created ?? null;
  },
  async getCredential() {
    const [found] = await db.select({
      channelId: channel.id, tenantId: channel.tenantId, wabaId: channel.wabaId,
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
  // Marks the sync requested unless it already was or the Channel onboarded
  // before `onboardedAfter`, so concurrent callers ask Meta at most once.
  async claimSync(sync: AppSync, onboardedAfter: Date) {
    const [claimed] = await db.update(channel).set({ [sync]: "requested" })
      .where(and(eq(channel.tenantId, scope.tenantId), eq(channel[sync], "pending"), gt(channel.createdAt, onboardedAfter)))
      .returning({ id: channel.id });
    return Boolean(claimed);
  },
  async recordSyncFailure(sync: AppSync) {
    await db.update(channel).set({ [sync]: "failed" }).where(eq(channel.tenantId, scope.tenantId));
  },
});

// The Tenant's Channel credential, still encrypted, for the WhatsApp adapter
// that sends from it. Null unless that Channel is still the Tenant's.
export const findChannelCredential = async (db: Database, scope: TenantScope, channelId: string) => {
  const stored = await createChannelRepository(db, scope).getCredential();
  return stored?.channelId === channelId ? stored : null;
};

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

// The business did not share its WhatsApp Business app history, so the
// dashboard says it was not imported.
export const recordHistoryDeclined = async (db: Database, route: ChannelRoute) => {
  await db.update(channel).set({ historySync: "declined" })
    .where(and(eq(channel.id, route.channelId), eq(channel.tenantId, route.tenantId)));
};
