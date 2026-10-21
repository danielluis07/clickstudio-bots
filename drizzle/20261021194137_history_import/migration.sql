ALTER TABLE "channel" ADD COLUMN "contacts_sync" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "channel" ADD COLUMN "history_sync" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "app_name" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "app_name_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "imported" boolean DEFAULT false NOT NULL;