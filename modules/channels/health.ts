import { and, eq, inArray, isNull, lte, ne, notInArray } from "drizzle-orm";
import type { Database } from "@/db/database";
import { channel, type ChannelHealth } from "@/db/schema";
import { activeTenant, type ChannelRoute } from "@/modules/channels/repository";
import type { TenantScope } from "@/modules/tenancy";
import type { Clock } from "@/platform/clock";
import type { Diagnostics } from "@/platform/diagnostics";
import type { EncryptedWhatsAppToken } from "@/platform/whatsapp-credentials";

// What an `account_update` event means for whether the Channel can send.
export type AccountUpdate =
  | { kind: "removed" }
  | { kind: "banned" }
  | { kind: "reinstated" }
  | { kind: "restricted"; until: Date | null };

// The states the owner clears by connecting the same number again. A ban or a
// restriction is Meta's to lift.
export const reconnectableHealth = [
  "credential_rejected",
  "removed",
] as const satisfies readonly ChannelHealth[];

// Each new state alerts the platform administrator once.
const becomes = (health: ChannelHealth, at: Date, restrictedUntil: Date | null = null) => ({
  health,
  healthChangedAt: at,
  healthAlertedAt: null,
  restrictedUntil,
  updatedAt: at,
});

// A call Meta refused for the Channel's credential. A ban or removal Meta
// reported keeps its own state: reconnecting would not lift it.
export const recordCredentialRejected = async (
  db: Database,
  scope: TenantScope | ChannelRoute,
  channelId: string,
  at: Date,
) => {
  await db
    .update(channel)
    .set(becomes("credential_rejected", at))
    .where(
      and(
        eq(channel.id, channelId),
        eq(channel.tenantId, scope.tenantId),
        inArray(channel.health, ["healthy", "restricted"]),
      ),
    );
};

// Applies an `account_update` from a signed Meta event. A more lasting state
// is never replaced by a lesser one: removal over a ban, a ban over a
// rejected credential or a restriction.
export const recordAccountUpdate = async (
  db: Database,
  route: ChannelRoute,
  update: AccountUpdate,
  at: Date,
) => {
  const routed = and(eq(channel.id, route.channelId), eq(channel.tenantId, route.tenantId));
  switch (update.kind) {
    case "removed":
      await db
        .update(channel)
        .set(becomes("removed", at))
        .where(and(routed, ne(channel.health, "removed")));
      return;
    case "banned":
      await db
        .update(channel)
        .set(becomes("banned", at))
        .where(and(routed, notInArray(channel.health, ["banned", "removed"])));
      return;
    case "reinstated":
      await db
        .update(channel)
        .set(becomes("healthy", at))
        .where(and(routed, eq(channel.health, "banned")));
      return;
    case "restricted":
      // A restriction that has already ended changes nothing.
      if (update.until && update.until <= at) return;
      await db
        .update(channel)
        .set(becomes("restricted", at, update.until))
        .where(and(routed, eq(channel.health, "healthy")));
      // A new end for a current restriction is not a new state to alert on.
      await db
        .update(channel)
        .set({ restrictedUntil: update.until, updatedAt: at })
        .where(and(routed, eq(channel.health, "restricted")));
      return;
  }
};

// Stores the credential the owner's new signup produced and makes the Channel
// healthy again. False unless the Channel was waiting for a reconnection.
export const reconnectChannel = async (
  db: Database,
  scope: TenantScope,
  input: { credential: EncryptedWhatsAppToken; at: Date },
) => {
  const reconnected = await db
    .update(channel)
    .set({ credential: input.credential, ...becomes("healthy", input.at) })
    .where(
      and(
        eq(channel.tenantId, scope.tenantId),
        activeTenant,
        inArray(channel.health, reconnectableHealth),
      ),
    )
    .returning({ id: channel.id });
  return reconnected.length > 0;
};

// Bounds one sweep; the next one continues where it stopped.
const alertedPerSweep = 100;

// The sweep: lifts restrictions whose end has passed, then alerts the
// platform administrator once about each Channel that became unhealthy.
export const sweepChannelHealth = async ({
  db,
  clock,
  diagnostics,
}: {
  db: Database;
  clock: Clock;
  diagnostics?: Diagnostics;
}) => {
  const now = clock.now();
  await db
    .update(channel)
    .set(becomes("healthy", now))
    .where(and(eq(channel.health, "restricted"), lte(channel.restrictedUntil, now)));
  const unalerted = await db
    .select({ id: channel.id, tenantId: channel.tenantId, health: channel.health })
    .from(channel)
    .where(and(ne(channel.health, "healthy"), isNull(channel.healthAlertedAt), activeTenant))
    .orderBy(channel.healthChangedAt)
    .limit(alertedPerSweep);
  for (const { id, tenantId, health } of unalerted) {
    await diagnostics?.alert({ kind: "channel_unhealthy", tenantId, operation: health });
    // Fenced on the alerted state: a change since then alerts on its own.
    await db
      .update(channel)
      .set({ healthAlertedAt: now })
      .where(and(eq(channel.id, id), eq(channel.health, health), isNull(channel.healthAlertedAt)));
  }
  return unalerted.length;
};

// One signal for the Channel's status at a glance: failing while the Bot cannot
// reply because of the account, warning while it waits on Meta (a restriction or
// an unconfirmed event subscription), healthy otherwise.
export type ChannelSignal = "healthy" | "warning" | "failing";

export const channelSignal = ({
  health,
  subscriptionStatus,
}: {
  health: ChannelHealth;
  subscriptionStatus: string;
}): ChannelSignal => {
  if (health === "healthy") return subscriptionStatus === "subscribed" ? "healthy" : "warning";
  return health === "restricted" ? "warning" : "failing";
};
