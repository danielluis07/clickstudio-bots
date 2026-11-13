ALTER TABLE "bot_settings" ADD COLUMN "profile_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bot_settings" ADD COLUMN "profile_updated_by_member_id" text;--> statement-breakpoint
ALTER TABLE "bot_settings" ADD COLUMN "behaviour_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bot_settings" ADD COLUMN "behaviour_updated_by_member_id" text;--> statement-breakpoint
ALTER TABLE "bot_settings" ADD CONSTRAINT "bot_settings_profile_updated_by_member_id_member_id_fkey" FOREIGN KEY ("profile_updated_by_member_id") REFERENCES "member"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "bot_settings" ADD CONSTRAINT "bot_settings_behaviour_updated_by_member_id_member_id_fkey" FOREIGN KEY ("behaviour_updated_by_member_id") REFERENCES "member"("id") ON DELETE SET NULL;--> statement-breakpoint
-- Every save before this one saved both parts together.
UPDATE "bot_settings" SET
  "profile_updated_at" = "updated_at",
  "profile_updated_by_member_id" = "updated_by_member_id",
  "behaviour_updated_at" = "updated_at",
  "behaviour_updated_by_member_id" = "updated_by_member_id";
