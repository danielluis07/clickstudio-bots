CREATE TABLE "bot_sandbox_usage" (
	"tenant_id" text PRIMARY KEY,
	"day" date NOT NULL,
	"turns" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bot_sandbox_usage" ADD CONSTRAINT "bot_sandbox_usage_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "organization"("id") ON DELETE CASCADE;