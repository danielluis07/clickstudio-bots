CREATE TABLE "bot_capture_settings" (
	"tenant_id" text PRIMARY KEY,
	"enabled" boolean NOT NULL,
	"fields" jsonb NOT NULL,
	"updated_by_member_id" text,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "need" text;--> statement-breakpoint
ALTER TABLE "bot_capture_settings" ADD CONSTRAINT "bot_capture_settings_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "bot_capture_settings" ADD CONSTRAINT "bot_capture_settings_updated_by_member_id_member_id_fkey" FOREIGN KEY ("updated_by_member_id") REFERENCES "member"("id") ON DELETE SET NULL;