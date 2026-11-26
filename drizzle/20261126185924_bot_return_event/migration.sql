CREATE TABLE "bot_return_event" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"trigger" text NOT NULL,
	"member_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "bot_return_event_conversation_id_idx" ON "bot_return_event" ("conversation_id");--> statement-breakpoint
ALTER TABLE "bot_return_event" ADD CONSTRAINT "bot_return_event_conversation_id_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversation"("id") ON DELETE CASCADE;