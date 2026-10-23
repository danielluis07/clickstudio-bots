import { and, eq } from "drizzle-orm";
import type { Database, Transaction } from "@/db/database";
import { channel } from "@/db/schema";
import type { TenantScope } from "@/modules/tenancy";

export const readChannelBotState = async (db: Database, scope: TenantScope) => {
  const [found] = await db
    .select({
      enabled: channel.botEnabled,
      paused: channel.botPaused,
      subscription: channel.subscriptionStatus,
    })
    .from(channel)
    .where(eq(channel.tenantId, scope.tenantId));
  return {
    enabled: found?.enabled ?? false,
    paused: found?.paused ?? false,
    connected: found?.subscription === "subscribed",
  };
};

// Activation supplies readiness from the transaction's snapshot. Channels owns
// the Tenant, owner and subscription fences on the flag write.
export const activateChannelBot = async (
  tx: Transaction,
  scope: TenantScope,
  input: { ready: boolean; at: Date },
) => {
  if (scope.role !== "owner") return { ok: false as const, error: "forbidden" as const };
  if (!input.ready) return { ok: false as const, error: "incomplete" as const };
  const changed = await tx
    .update(channel)
    .set({ botEnabled: true, updatedAt: input.at })
    .where(and(eq(channel.tenantId, scope.tenantId), eq(channel.subscriptionStatus, "subscribed")))
    .returning({ id: channel.id });
  return changed.length
    ? { ok: true as const }
    : { ok: false as const, error: "incomplete" as const };
};

export const setChannelBotPaused = async (
  db: Database,
  scope: TenantScope,
  input: { paused: boolean; at: Date },
) => {
  if (typeof input.paused !== "boolean") return { ok: false as const, error: "invalid" as const };
  const changed = await db
    .update(channel)
    .set({ botPaused: input.paused, updatedAt: input.at })
    .where(and(eq(channel.tenantId, scope.tenantId), eq(channel.botEnabled, true)))
    .returning({ id: channel.id });
  return changed.length
    ? { ok: true as const }
    : { ok: false as const, error: "inactive" as const };
};
