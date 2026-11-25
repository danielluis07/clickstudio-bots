-- The Handoff the Bot put off to ask for required Contact details, and when
-- it asked (#105). Null for existing rows: a request sent before this deploy
-- is not completed automatically, and a later model Handoff asks once more.
ALTER TABLE "conversation" ADD COLUMN "pending_handoff_reason" text;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "pending_handoff_at" timestamp with time zone;
