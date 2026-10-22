CREATE TABLE "bot_link_settings" (
	"tenant_id" text PRIMARY KEY,
	"enabled" boolean NOT NULL,
	"links" jsonb NOT NULL,
	"updated_by_member_id" text,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bot_link_settings" ADD CONSTRAINT "bot_link_settings_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "bot_link_settings" ADD CONSTRAINT "bot_link_settings_updated_by_member_id_member_id_fkey" FOREIGN KEY ("updated_by_member_id") REFERENCES "member"("id") ON DELETE SET NULL;