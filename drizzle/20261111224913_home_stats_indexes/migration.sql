CREATE INDEX "conversation_contact_id_idx" ON "conversation" ("contact_id");--> statement-breakpoint
CREATE INDEX "message_tenant_id_sent_at_idx" ON "message" ("tenant_id","sent_at");