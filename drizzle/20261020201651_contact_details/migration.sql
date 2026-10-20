DROP INDEX "contact_tenant_id_phone_unique";--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "whatsapp_id" text;--> statement-breakpoint
UPDATE "contact" SET "whatsapp_id" = "phone";--> statement-breakpoint
ALTER TABLE "contact" ALTER COLUMN "whatsapp_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "name" text;--> statement-breakpoint
CREATE UNIQUE INDEX "contact_tenant_id_whatsapp_id_unique" ON "contact" ("tenant_id","whatsapp_id");
