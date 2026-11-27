import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization } from "@/db/schema/tenancy";
import { id, timestamps } from "@/db/columns";

// A Tenant's Subscription (ADR 0012): Mercado Pago's `preapproval`, written
// only by `modules/billing`. One per Tenant; a cancelled one is replaced when
// the owner subscribes again. Not the Channel's Meta webhook subscription
// (`channel.subscription_status`).
export const subscription = pgTable("subscription", {
  id: id(),
  tenantId: text("tenant_id")
    .notNull()
    .unique()
    .references(() => organization.id, { onDelete: "cascade" }),
  mercadoPagoId: text("mercado_pago_id").notNull().unique(),
  // Mercado Pago's own status. Only `authorized` is an active Subscription.
  status: text("status").notNull(),
  payerEmail: text("payer_email").notNull(),
  amountCents: integer("amount_cents").notNull(),
  nextChargeAt: timestamp("next_charge_at", { withTimezone: true }),
  // The card that pays it, for the owner to recognise: the brand Mercado Pago
  // names (`visa`, `master`, …) and the last 4 digits the Card Payment Brick
  // showed. Either may be null; never the card's number.
  cardBrand: text("card_brand"),
  cardLastFour: text("card_last_four"),
  // The Grace period's end: 7 days after a failed monthly charge, null while
  // no charge is overdue. A successful charge clears it.
  graceEndsAt: timestamp("grace_ends_at", { withTimezone: true }),
  // Set when the owner (or a canceled Tenant) cancels: the end of the Trial
  // or of the month already paid for, until which the cancelled Subscription
  // still pays for the Plan. Null for one Mercado Pago cancelled itself, and
  // when cancelled with a charge overdue (the Grace period then decides).
  paidUntil: timestamp("paid_until", { withTimezone: true }),
  // The latest successful charge seen, so a failure from before it (a
  // replayed notification) starts no Grace period.
  lastChargedAt: timestamp("last_charged_at", { withTimezone: true }),
  // When the sweep last re-read it from Mercado Pago, so each run starts with
  // the ones it re-read longest ago.
  reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
  // Mercado Pago's `last_modified` for the state stored here. An older read
  // (webhooks arrive out of order) never overwrites a newer one.
  providerModifiedAt: timestamp("provider_modified_at", { withTimezone: true }).notNull(),
  ...timestamps(),
});

// One Charge of a Tenant's Subscription: a Mercado Pago payment, kept up to
// date by its notifications, for the owner's payment history. Written only by
// `modules/billing`. A retried charge is a new payment, so a refusal and the
// retry that succeeded are two rows. The card check is not stored.
export const subscriptionCharge = pgTable(
  "subscription_charge",
  {
    id: id(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    mercadoPagoId: text("mercado_pago_id").notNull().unique(),
    // Mercado Pago's own status: `approved`, `rejected`, `refunded`, …
    status: text("status").notNull(),
    amountCents: integer("amount_cents").notNull(),
    // When the charge was attempted.
    chargedAt: timestamp("charged_at", { withTimezone: true }).notNull(),
    // Mercado Pago's `date_last_updated` for the state stored here. An older
    // read (notifications arrive out of order) never overwrites a newer one.
    providerModifiedAt: timestamp("provider_modified_at", { withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (t) => [index("subscription_charge_tenant_charged_at_idx").on(t.tenantId, t.chargedAt)],
);
