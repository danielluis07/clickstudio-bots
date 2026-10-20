CREATE TABLE "contact" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL,
	"phone" text NOT NULL,
	"profile_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"wamid" text NOT NULL,
	"direction" text NOT NULL,
	"type" text NOT NULL,
	"text" text,
	"sent_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_event" (
	"id" text PRIMARY KEY,
	"dedupe_key" text NOT NULL UNIQUE,
	"field" text NOT NULL,
	"phone_number_id" text,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"ignored_reason" text,
	"received_at" timestamp with time zone NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "contact_tenant_id_phone_unique" ON "contact" ("tenant_id","phone");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_channel_id_contact_id_unique" ON "conversation" ("channel_id","contact_id");--> statement-breakpoint
CREATE INDEX "conversation_tenant_id_idx" ON "conversation" ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_tenant_id_wamid_unique" ON "message" ("tenant_id","wamid");--> statement-breakpoint
CREATE INDEX "message_conversation_id_sent_at_idx" ON "message" ("conversation_id","sent_at");--> statement-breakpoint
CREATE INDEX "inbox_event_status_received_at_idx" ON "inbox_event" ("status","received_at");--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_channel_id_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channel"("id");--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_contact_id_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contact"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_conversation_id_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversation"("id") ON DELETE CASCADE;