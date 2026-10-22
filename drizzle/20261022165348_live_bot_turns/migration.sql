ALTER TABLE "conversation" ADD COLUMN "owner" text DEFAULT 'bot' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "handoff_reason" text;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "bot_lease_token" text;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "bot_lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "bot_answered" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "answered_message_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "message_conversation_answered_message_unique" ON "message" ("conversation_id","answered_message_id");