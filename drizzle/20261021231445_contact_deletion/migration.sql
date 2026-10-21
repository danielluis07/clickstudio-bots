CREATE TABLE "contact_deletion" (
	"tenant_id" text NOT NULL,
	"address_hash" text NOT NULL,
	"deleted_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "contact_deletion_tenant_id_address_hash_unique" ON "contact_deletion" ("tenant_id","address_hash");--> statement-breakpoint
ALTER TABLE "contact_deletion" ADD CONSTRAINT "contact_deletion_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "organization"("id") ON DELETE CASCADE;