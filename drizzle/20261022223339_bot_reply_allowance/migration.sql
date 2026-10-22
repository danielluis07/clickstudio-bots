CREATE TABLE "bot_reply_usage" (
	"tenant_id" text,
	"period" date,
	"replies" integer NOT NULL,
  "warning_to" text,
  "warning_claim_token" text,
  "warning_lease_until" timestamp with time zone,
  "warning_sent_at" timestamp with time zone,
	CONSTRAINT "bot_reply_usage_pkey" PRIMARY KEY("tenant_id","period")
);
--> statement-breakpoint
ALTER TABLE "bot_reply_usage" ADD CONSTRAINT "bot_reply_usage_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- Existing acknowledged replies predate acknowledgment timestamps; use their send time.
INSERT INTO "bot_reply_usage" ("tenant_id", "period", "replies")
SELECT "tenant_id", date_trunc('month', "sent_at" AT TIME ZONE 'America/Sao_Paulo')::date, count(*)::integer
FROM "message"
WHERE "origin" = 'bot' AND "direction" = 'outbound' AND "type" = 'text'
  AND NOT "imported" AND "wamid" IS NOT NULL
GROUP BY "tenant_id", date_trunc('month', "sent_at" AT TIME ZONE 'America/Sao_Paulo')::date;
