ALTER TABLE "subscription" ADD COLUMN "grace_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "last_charged_at" timestamp with time zone;