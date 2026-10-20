DROP INDEX "conversation_tenant_id_idx";--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "last_message_at" timestamp with time zone;--> statement-breakpoint
UPDATE "conversation" SET "last_message_at" = coalesce(
	(SELECT max("sent_at") FROM "message" WHERE "message"."conversation_id" = "conversation"."id"),
	"conversation"."created_at"
);--> statement-breakpoint
ALTER TABLE "conversation" ALTER COLUMN "last_message_at" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "conversation_tenant_id_last_message_at_idx" ON "conversation" ("tenant_id","last_message_at" DESC NULLS LAST,"id" DESC NULLS LAST);
