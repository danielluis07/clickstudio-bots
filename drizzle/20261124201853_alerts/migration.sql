CREATE TABLE "alert" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL,
	"member_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"kind" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"message_id" text,
	"event_key" text NOT NULL,
	"raised_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "alert_member_id_conversation_id_kind_unread_unique" ON "alert" ("member_id","conversation_id","kind") WHERE "read_at" is null;--> statement-breakpoint
CREATE INDEX "alert_member_id_raised_at_idx" ON "alert" ("member_id","raised_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "alert_conversation_id_idx" ON "alert" ("conversation_id");--> statement-breakpoint
CREATE INDEX "alert_raised_at_idx" ON "alert" ("raised_at");--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_conversation_id_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversation"("id") ON DELETE CASCADE;