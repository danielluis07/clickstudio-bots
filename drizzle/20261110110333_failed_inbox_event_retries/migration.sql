ALTER TABLE "inbox_event" ADD COLUMN "auto_retries" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inbox_event" ADD COLUMN "retried_at" timestamp with time zone;