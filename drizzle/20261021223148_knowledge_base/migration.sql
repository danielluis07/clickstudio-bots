CREATE TABLE "knowledge_base_entry" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"updated_by_member_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "knowledge_base_entry_tenant_id_created_at_idx" ON "knowledge_base_entry" ("tenant_id","created_at","id");--> statement-breakpoint
ALTER TABLE "knowledge_base_entry" ADD CONSTRAINT "knowledge_base_entry_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "knowledge_base_entry" ADD CONSTRAINT "knowledge_base_entry_updated_by_member_id_member_id_fkey" FOREIGN KEY ("updated_by_member_id") REFERENCES "member"("id") ON DELETE SET NULL;