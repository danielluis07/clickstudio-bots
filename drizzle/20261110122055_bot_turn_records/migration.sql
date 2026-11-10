CREATE TABLE "bot_turn_record" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"outcome" text NOT NULL,
	"handoff_reason" text,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cache_read_tokens" integer NOT NULL,
	"cache_write_tokens" integer NOT NULL,
	"tool_round_trips" integer NOT NULL,
	"duration_ms" integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX "bot_turn_record_tenant_id_at_idx" ON "bot_turn_record" ("tenant_id","at");--> statement-breakpoint
CREATE INDEX "bot_turn_record_at_idx" ON "bot_turn_record" ("at");--> statement-breakpoint
ALTER TABLE "bot_turn_record" ADD CONSTRAINT "bot_turn_record_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "organization"("id") ON DELETE CASCADE;