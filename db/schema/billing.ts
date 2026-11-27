import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
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
  // Mercado Pago's `last_modified` for the state stored here. An older read
  // (webhooks arrive out of order) never overwrites a newer one.
  providerModifiedAt: timestamp("provider_modified_at", { withTimezone: true }).notNull(),
  ...timestamps(),
});
