import { and, asc, eq, isNotNull, isNull, lte, not, sql } from "drizzle-orm";
import type { Database } from "@/db/database";
import { organization } from "@/db/schema";
import { isPlatformAdmin } from "@/modules/identity";
import { forbidden, recordAdminActivity, type TenantScope } from "@/modules/tenancy";
import type { Clock } from "@/platform/clock";

export const trialDays = 30;
const trialMs = trialDays * 24 * 60 * 60 * 1000;

// Whether the Tenant row's Tenant has an active Subscription. There are none
// until owners can subscribe (#257), which replaces this stub.
const hasActiveSubscription = sql<boolean>`false`;

// Billing behind its per-environment switch (ADR 0012). While `enabled` is
// false no Trial counts down and no Tenant is Suspended.
export const createBilling = ({
  db,
  clock,
  enabled,
}: {
  db: Database;
  clock: Clock;
  enabled: boolean;
}) => {
  const trialEndFrom = (start: Date) => new Date(start.getTime() + trialMs);

  return {
    // A new Tenant's Trial end: 30 days from its creation while billing is
    // on, none while it is off (the launch action sets it later).
    trialEndFor: (createdAt: Date) => (enabled ? trialEndFrom(createdAt) : null),

    // The launch action: every Tenant without a Trial end gets 30 days from
    // now. Tenants that already have one keep it, so running it again
    // changes nothing.
    async launch() {
      if (!enabled) return { ok: false as const, error: "billing_disabled" as const };
      const started = await db
        .update(organization)
        .set({ trialEndsAt: trialEndFrom(clock.now()) })
        .where(isNull(organization.trialEndsAt))
        .returning({ id: organization.id });
      return { ok: true as const, started: started.length };
    },

    // Run by the sweep (ADR 0007): Suspends every Tenant whose Trial has ended
    // without an active Subscription. A canceled Tenant is left alone, being
    // already stopped for its own reason. With billing off it Suspends nobody
    // and lifts any suspension left from when it was on.
    async sweep() {
      if (!enabled) {
        await db
          .update(organization)
          .set({ suspendedAt: null })
          .where(isNotNull(organization.suspendedAt));
        return 0;
      }
      const now = clock.now();
      const suspended = await db
        .update(organization)
        .set({ suspendedAt: now })
        .where(
          and(
            isNull(organization.suspendedAt),
            isNull(organization.canceledAt),
            lte(organization.trialEndsAt, now),
            not(hasActiveSubscription),
          ),
        )
        .returning({ id: organization.id });
      return suspended.length;
    },

    // Every Tenant's Trial end and Suspended state, for the platform
    // administrator to pick the one to extend.
    async trials(actorId: string) {
      if (!(await isPlatformAdmin(db, actorId))) return forbidden;
      if (!enabled) return { ok: false as const, error: "billing_disabled" as const };
      const tenants = await db
        .select({
          id: organization.id,
          name: organization.name,
          trialEndsAt: organization.trialEndsAt,
          suspendedAt: organization.suspendedAt,
        })
        .from(organization)
        .orderBy(asc(organization.name), asc(organization.id));
      return {
        ok: true as const,
        tenants: tenants.map(({ suspendedAt, ...tenant }) => ({
          ...tenant,
          suspended: Boolean(suspendedAt),
        })),
      };
    },

    // The platform administrator moves one Tenant's Trial end to a later
    // instant. A Tenant Suspended because its Trial ended returns to normal at
    // once. A Tenant with an active Subscription has no Trial left to extend.
    async extendTrial(actorId: string, tenantId: string, trialEndsAt: Date) {
      if (!(await isPlatformAdmin(db, actorId))) return forbidden;
      if (!enabled) return { ok: false as const, error: "billing_disabled" as const };
      const now = clock.now();
      if (trialEndsAt <= now) return { ok: false as const, error: "not_future" as const };
      return db.transaction(async (tx) => {
        const [extended] = await tx
          .update(organization)
          .set({ trialEndsAt, suspendedAt: null })
          .where(and(eq(organization.id, tenantId), not(hasActiveSubscription)))
          .returning({ name: organization.name });
        if (!extended) {
          const [found] = await tx
            .select({ id: organization.id })
            .from(organization)
            .where(eq(organization.id, tenantId));
          return found
            ? { ok: false as const, error: "subscribed" as const }
            : { ok: false as const, error: "not_found" as const };
        }
        await recordAdminActivity(
          tx,
          { tenantId, adminId: actorId },
          { action: "trial.extended", at: now },
        );
        return { ok: true as const, tenantName: extended.name, trialEndsAt };
      });
    },

    // What the scope's Tenant's Members see of billing.
    async status(scope: TenantScope) {
      if (!enabled) return { trialEndsAt: null, suspended: false };
      const [found] = await db
        .select({ trialEndsAt: organization.trialEndsAt, suspendedAt: organization.suspendedAt })
        .from(organization)
        .where(eq(organization.id, scope.tenantId));
      return {
        trialEndsAt: found?.trialEndsAt ?? null,
        suspended: Boolean(found?.suspendedAt),
      };
    },
  };
};

export type Billing = ReturnType<typeof createBilling>;

// One row of the platform administrator's list of Trials.
export type TenantTrial = Extract<
  Awaited<ReturnType<Billing["trials"]>>,
  { ok: true }
>["tenants"][number];
