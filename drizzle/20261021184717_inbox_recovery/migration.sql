ALTER TABLE "inbox_event" ADD COLUMN "error_class" text;--> statement-breakpoint
ALTER TABLE "inbox_event" ADD COLUMN "failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inbox_event" ADD COLUMN "alerted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "inbox_event_received_at_idx" ON "inbox_event" ("received_at");