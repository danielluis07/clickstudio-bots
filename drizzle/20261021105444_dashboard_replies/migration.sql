ALTER TABLE "message" ADD COLUMN "origin" text;--> statement-breakpoint
UPDATE "message" SET "origin" = 'contact';--> statement-breakpoint
ALTER TABLE "message" ALTER COLUMN "origin" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "author_member_id" text;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "status" text;--> statement-breakpoint
ALTER TABLE "message" ALTER COLUMN "wamid" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_author_member_id_member_id_fkey" FOREIGN KEY ("author_member_id") REFERENCES "member"("id") ON DELETE SET NULL;
