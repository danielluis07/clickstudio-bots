-- Tenant Subscriptions (#257, ADR 0012): one Mercado Pago preapproval per Tenant.
CREATE TABLE "subscription" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL UNIQUE,
	"mercado_pago_id" text NOT NULL UNIQUE,
	"status" text NOT NULL,
	"payer_email" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"next_charge_at" timestamp with time zone,
	"provider_modified_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "organization"("id") ON DELETE CASCADE;