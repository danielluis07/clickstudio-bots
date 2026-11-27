CREATE TABLE "subscription_charge" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL,
	"mercado_pago_id" text NOT NULL UNIQUE,
	"status" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"charged_at" timestamp with time zone NOT NULL,
	"provider_modified_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "subscription_charge_tenant_charged_at_idx" ON "subscription_charge" ("tenant_id","charged_at");--> statement-breakpoint
ALTER TABLE "subscription_charge" ADD CONSTRAINT "subscription_charge_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "organization"("id") ON DELETE CASCADE;