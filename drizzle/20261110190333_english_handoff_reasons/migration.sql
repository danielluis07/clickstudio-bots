-- Handoff reasons move from Portuguese identifiers to English (#173).
-- Maps a legacy spelling to its English one; any other value is returned unchanged.
CREATE FUNCTION "english_handoff_reason"(reason text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE reason
    WHEN 'sem_resposta' THEN 'no_answer'
    WHEN 'pedido_do_contato' THEN 'contact_request'
    WHEN 'regra_do_negocio' THEN 'handoff_topic'
    WHEN 'bot_indisponivel' THEN 'bot_unavailable'
    WHEN 'limite_atingido' THEN 'allowance_exhausted'
    WHEN 'limite_do_contato' THEN 'contact_cap_reached'
    WHEN 'assumida' THEN 'claimed'
    WHEN 'resposta_no_painel' THEN 'dashboard_reply'
    WHEN 'resposta_no_app' THEN 'app_reply'
    ELSE reason
  END
$$;--> statement-breakpoint
-- Migrations run before the deploy, so instances still on the old code keep
-- writing the old spellings until they are replaced. This trigger rewrites
-- them on write; a follow-up migration drops it once no old instance remains.
CREATE FUNCTION "english_handoff_reason_on_write"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW."handoff_reason" := "english_handoff_reason"(NEW."handoff_reason");
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER "conversation_english_handoff_reason"
BEFORE INSERT OR UPDATE OF "handoff_reason" ON "conversation"
FOR EACH ROW EXECUTE FUNCTION "english_handoff_reason_on_write"();--> statement-breakpoint
CREATE TRIGGER "bot_turn_record_english_handoff_reason"
BEFORE INSERT OR UPDATE OF "handoff_reason" ON "bot_turn_record"
FOR EACH ROW EXECUTE FUNCTION "english_handoff_reason_on_write"();--> statement-breakpoint
UPDATE "conversation" SET "handoff_reason" = "english_handoff_reason"("handoff_reason")
WHERE "handoff_reason" IS DISTINCT FROM "english_handoff_reason"("handoff_reason");--> statement-breakpoint
UPDATE "bot_turn_record" SET "handoff_reason" = "english_handoff_reason"("handoff_reason")
WHERE "handoff_reason" IS DISTINCT FROM "english_handoff_reason"("handoff_reason");
