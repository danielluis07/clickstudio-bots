CREATE TABLE "bot_settings" (
	"tenant_id" text PRIMARY KEY,
	"business_name" text NOT NULL,
	"offer" text NOT NULL,
	"address" text NOT NULL,
	"hours" jsonb NOT NULL,
	"tone" text NOT NULL,
	"emoji" boolean NOT NULL,
	"greeting" text NOT NULL,
	"rules" text NOT NULL,
	"refused_topics" jsonb NOT NULL,
	"handoff_topics" jsonb NOT NULL,
	"schedule" text NOT NULL,
	"updated_by_member_id" text,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bot_settings" ADD CONSTRAINT "bot_settings_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "bot_settings" ADD CONSTRAINT "bot_settings_updated_by_member_id_member_id_fkey" FOREIGN KEY ("updated_by_member_id") REFERENCES "member"("id") ON DELETE SET NULL;