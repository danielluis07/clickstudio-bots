ALTER TABLE "early_message_status" ADD COLUMN "failure_code" integer;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "failure_code" integer;