CREATE TABLE "bot_activation" (
	"tenant_id" text PRIMARY KEY,
	"tested_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channel" ADD COLUMN "bot_paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bot_activation" ADD CONSTRAINT "bot_activation_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "organization"("id") ON DELETE CASCADE;