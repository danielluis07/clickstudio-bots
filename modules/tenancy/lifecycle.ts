import { and, eq, isNotNull, ne, or, sql } from "drizzle-orm";
import type { Database } from "@/db/database";
import { channel, organization } from "@/db/schema";
import type { WhatsAppGateway } from "@/modules/channels";
import { isPlatformAdmin } from "@/modules/identity";
import type { Clock } from "@/platform/clock";

// Privileged operations: unlike Member repositories, these require a current
// platform administrator and never turn a supplied Tenant id into a TenantScope.
export const tenantRecoveryDays = 30;
const recoveryMs = tenantRecoveryDays * 24 * 60 * 60 * 1000;
// Longer than the adapter's bounded requests; interrupted commands are retryable.
const operationLeaseMs = 120_000;

export const createTenantLifecycle = ({
  db,
  clock,
  getWhatsApp,
}: {
  db: Database;
  clock: Clock;
  getWhatsApp: () => Pick<WhatsAppGateway, "subscribe" | "unsubscribe">;
}) => {
  const claim = (tenantId: string, operation: "cancel" | "reactivate" | "disconnect") =>
    db.transaction(async (tx) => {
      const [tenant] = await tx
        .select()
        .from(organization)
        .where(eq(organization.id, tenantId))
        .for("update");
      if (!tenant) return { ok: false as const, error: "not_found" as const };
      const now = clock.now();
      if (tenant.lifecycleLeaseUntil && tenant.lifecycleLeaseUntil > now)
        return { ok: false as const, error: "busy" as const };
      if (operation === "disconnect" && !tenant.canceledAt)
        return { ok: false as const, error: "not_canceled" as const };
      if (operation === "reactivate") {
        if (!tenant.canceledAt) return { ok: false as const, error: "not_canceled" as const };
        if (tenant.canceledAt.getTime() + recoveryMs <= now.getTime())
          return { ok: false as const, error: "recovery_expired" as const };
      }
      const canceledAt = tenant.canceledAt ?? now;
      const token = crypto.randomUUID();
      await tx
        .update(organization)
        .set({
          canceledAt,
          lifecycleToken: token,
          lifecycleLeaseUntil: new Date(now.getTime() + operationLeaseMs),
        })
        .where(eq(organization.id, tenantId));
      const [stored] = await tx
        .update(channel)
        .set({ subscriptionStatus: "disconnected", subscriptionError: "disconnect_pending" })
        .where(eq(channel.tenantId, tenantId))
        .returning();
      return { ok: true as const, canceledAt, stored, token };
    });

  const release = (tenantId: string, token: string) =>
    db
      .update(organization)
      .set({ lifecycleToken: null, lifecycleLeaseUntil: null })
      .where(and(eq(organization.id, tenantId), eq(organization.lifecycleToken, token)));

  const disconnect = async (tenantId: string, operation: "cancel" | "disconnect") => {
    const claimed = await claim(tenantId, operation);
    if (!claimed.ok) return claimed;
    const { stored, canceledAt, token } = claimed;
    try {
      // The local stop commits before Meta. Failure cannot leave the Tenant
      // replying or reset the deletion deadline on a retry.
      const disconnected =
        !stored ||
        (await Promise.resolve()
          .then(() => getWhatsApp().unsubscribe(stored))
          .then((result) => result.ok)
          .catch(() => false));
      if (stored)
        await db
          .update(channel)
          .set({ subscriptionError: disconnected ? null : "disconnect_failed" })
          .where(
            and(
              eq(channel.id, stored.id),
              eq(channel.tenantId, tenantId),
              sql`exists(select 1 from ${organization} where ${organization.id} = ${tenantId} and ${organization.lifecycleToken} = ${token})`,
            ),
          );
      return { ok: true as const, canceledAt, channelDisconnected: disconnected };
    } finally {
      await release(tenantId, token);
    }
  };

  return {
    async cancel(actorId: string, tenantId: string) {
      if (!(await isPlatformAdmin(db, actorId)))
        return { ok: false as const, error: "forbidden" as const };
      return disconnect(tenantId, "cancel");
    },
    // System-only, composed into the authenticated daily task. Recheck the
    // cancellation while claiming so a reactivated candidate is never canceled.
    async retryDisconnections() {
      const candidates = await db
        .select({ id: organization.id })
        .from(organization)
        .innerJoin(channel, eq(channel.tenantId, organization.id))
        .where(
          and(
            isNotNull(organization.canceledAt),
            or(
              ne(channel.subscriptionStatus, "disconnected"),
              eq(channel.subscriptionError, "disconnect_pending"),
              eq(channel.subscriptionError, "disconnect_failed"),
            ),
          ),
        );
      let failed = false;
      for (const { id } of candidates) {
        const result = await disconnect(id, "disconnect");
        if (result.ok && !result.channelDisconnected) failed = true;
      }
      if (failed) throw new Error("Tenant disconnection failed");
    },
    async reactivate(actorId: string, tenantId: string) {
      if (!(await isPlatformAdmin(db, actorId)))
        return { ok: false as const, error: "forbidden" as const };
      const claimed = await claim(tenantId, "reactivate");
      if (!claimed.ok) return claimed;
      const { stored, token } = claimed;
      try {
        const subscribed =
          !stored ||
          (await Promise.resolve()
            .then(() => getWhatsApp().subscribe(stored))
            .then((result) => result.ok)
            .catch(() => false));
        if (!subscribed) return { ok: false as const, error: "subscription_failed" as const };
        return await db.transaction(async (tx) => {
          const [tenant] = await tx
            .select()
            .from(organization)
            .where(eq(organization.id, tenantId))
            .for("update");
          if (!tenant || tenant.lifecycleToken !== token)
            return { ok: false as const, error: "busy" as const };
          // The recovery window may close while Meta is responding.
          if (
            !tenant.canceledAt ||
            tenant.canceledAt.getTime() + recoveryMs <= clock.now().getTime()
          )
            return { ok: false as const, error: "recovery_expired" as const };
          await tx
            .update(organization)
            .set({ canceledAt: null })
            .where(eq(organization.id, tenantId));
          if (stored)
            await tx
              .update(channel)
              .set({
                subscriptionStatus: "subscribed",
                subscriptionError: null,
                subscriptionAttemptedAt: clock.now(),
              })
              .where(eq(channel.id, stored.id));
          return { ok: true as const };
        });
      } finally {
        await release(tenantId, token);
      }
    },
  };
};
