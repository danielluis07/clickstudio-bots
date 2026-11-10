-- Drops the temporary guard added with the English Handoff reasons (#173, #175).
-- No instance on the Portuguese code remains, so nothing writes an old spelling.
-- Rewrite one last time first, for any row written while a trigger was missing.
UPDATE "conversation" SET "handoff_reason" = "english_handoff_reason"("handoff_reason")
WHERE "handoff_reason" IS DISTINCT FROM "english_handoff_reason"("handoff_reason");--> statement-breakpoint
UPDATE "bot_turn_record" SET "handoff_reason" = "english_handoff_reason"("handoff_reason")
WHERE "handoff_reason" IS DISTINCT FROM "english_handoff_reason"("handoff_reason");--> statement-breakpoint
DROP TRIGGER IF EXISTS "conversation_english_handoff_reason" ON "conversation";--> statement-breakpoint
DROP TRIGGER IF EXISTS "bot_turn_record_english_handoff_reason" ON "bot_turn_record";--> statement-breakpoint
DROP FUNCTION IF EXISTS "english_handoff_reason_on_write"();--> statement-breakpoint
DROP FUNCTION IF EXISTS "english_handoff_reason"(text);
