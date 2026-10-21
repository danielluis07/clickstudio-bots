CREATE TABLE "message_change" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL,
	"wamid" text NOT NULL,
	"original_wamid" text NOT NULL,
	"direction" text NOT NULL,
	"kind" text NOT NULL,
	"text" text,
	"changed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "message_change_tenant_id_kind_wamid_unique" ON "message_change" ("tenant_id","kind","wamid");--> statement-breakpoint
CREATE INDEX "message_change_tenant_id_original_wamid_idx" ON "message_change" ("tenant_id","original_wamid");--> statement-breakpoint
ALTER TABLE "message_change" ADD CONSTRAINT "message_change_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "organization"("id") ON DELETE CASCADE;