CREATE TABLE "early_message_status" (
	"tenant_id" text NOT NULL,
	"wamid" text NOT NULL,
	"status" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "early_message_status_tenant_id_wamid_unique" ON "early_message_status" ("tenant_id","wamid");--> statement-breakpoint
CREATE INDEX "early_message_status_received_at_idx" ON "early_message_status" ("received_at");--> statement-breakpoint
ALTER TABLE "early_message_status" ADD CONSTRAINT "early_message_status_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "organization"("id") ON DELETE CASCADE;