CREATE TABLE "handoff_event" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"reason" text NOT NULL,
	"actor" text NOT NULL,
	"member_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "handoff_event_tenant_id_occurred_at_idx" ON "handoff_event" ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "handoff_event_conversation_id_idx" ON "handoff_event" ("conversation_id");--> statement-breakpoint
ALTER TABLE "handoff_event" ADD CONSTRAINT "handoff_event_conversation_id_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversation"("id") ON DELETE CASCADE;