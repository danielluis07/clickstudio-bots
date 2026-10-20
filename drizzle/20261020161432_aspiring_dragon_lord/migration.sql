CREATE TABLE "channel" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL UNIQUE,
	"waba_id" text NOT NULL UNIQUE,
	"phone_number_id" text NOT NULL UNIQUE,
	"display_phone_number" text NOT NULL,
	"credential" jsonb NOT NULL,
	"bot_enabled" boolean DEFAULT false NOT NULL,
	"subscription_status" text DEFAULT 'pending' NOT NULL,
	"subscription_fields" jsonb NOT NULL,
	"subscription_attempted_at" timestamp with time zone,
	"subscription_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channel" ADD CONSTRAINT "channel_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "organization"("id") ON DELETE CASCADE;