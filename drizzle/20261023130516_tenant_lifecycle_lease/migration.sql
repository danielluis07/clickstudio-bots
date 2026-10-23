ALTER TABLE "organization" ADD COLUMN "lifecycle_token" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "lifecycle_lease_until" timestamp with time zone;