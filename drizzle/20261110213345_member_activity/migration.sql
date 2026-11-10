CREATE TABLE "member_activity" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" text NOT NULL,
	"subject_id" text,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "member_activity_tenant_id_occurred_at_idx" ON "member_activity" ("tenant_id","occurred_at");--> statement-breakpoint
-- Member activity is append-only (#155). Updates and truncation are always
-- refused. A delete is allowed only once the entry's Tenant row is gone, so
-- only Tenant deletion, which deletes the organization first, removes entries.
CREATE FUNCTION "member_activity_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (
    SELECT 1 FROM "organization" WHERE "id" = OLD."tenant_id"
  ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'member_activity is append-only' USING ERRCODE = 'insufficient_privilege';
END
$$;--> statement-breakpoint
CREATE TRIGGER "member_activity_append_only"
BEFORE UPDATE OR DELETE ON "member_activity"
FOR EACH ROW EXECUTE FUNCTION "member_activity_append_only"();--> statement-breakpoint
CREATE TRIGGER "member_activity_no_truncate"
BEFORE TRUNCATE ON "member_activity"
FOR EACH STATEMENT EXECUTE FUNCTION "member_activity_append_only"();
