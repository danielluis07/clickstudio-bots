ALTER TABLE "conversation" ADD COLUMN "waiting" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "echo_unresolved" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Conversations already with the team join the waiting list.
UPDATE "conversation" SET "waiting" = true WHERE "owner" = 'team';
