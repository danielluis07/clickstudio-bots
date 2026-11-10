ALTER TABLE "channel" ADD COLUMN "health" text DEFAULT 'healthy' NOT NULL;--> statement-breakpoint
ALTER TABLE "channel" ADD COLUMN "health_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "channel" ADD COLUMN "health_alerted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "channel" ADD COLUMN "restricted_until" timestamp with time zone;