CREATE TABLE "alert_preference" (
	"member_id" text PRIMARY KEY,
	"handoff" boolean DEFAULT true NOT NULL,
	"team_message" boolean DEFAULT true NOT NULL,
	"any_message" boolean DEFAULT false NOT NULL,
	"sound" boolean DEFAULT false NOT NULL,
	"browser_notification" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_preference" ADD CONSTRAINT "alert_preference_member_id_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE CASCADE;