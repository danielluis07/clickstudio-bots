-- Billing's Trial end and Suspended state (#255, ADR 0012). Existing Tenants
-- get no Trial end: none counts down until the launch action sets them.
ALTER TABLE "organization" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "suspended_at" timestamp with time zone;
