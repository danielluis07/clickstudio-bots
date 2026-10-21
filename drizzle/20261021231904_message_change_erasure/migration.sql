ALTER TABLE "message_change" ADD COLUMN "contact_address_hash" text;
--> statement-breakpoint
-- Recover the address of legacy changes from an original already filed.
UPDATE "message_change" AS mc
SET "contact_address_hash" = encode(sha256(convert_to(mc."tenant_id" || ':' || ct."phone", 'UTF8')), 'hex')
FROM "message" AS m
JOIN "conversation" AS cv ON cv."id" = m."conversation_id"
JOIN "contact" AS ct ON ct."id" = cv."contact_id"
WHERE m."tenant_id" = mc."tenant_id" AND ct."tenant_id" = mc."tenant_id"
  AND m."wamid" = mc."original_wamid" AND m."direction" = mc."direction";
--> statement-breakpoint
-- An orphan change still has its address in its retained signed inbox event.
-- Match the Tenant, direction, kind and both message identities before using it.
UPDATE "message_change" AS mc
SET "contact_address_hash" = encode(sha256(convert_to(mc."tenant_id" || ':' || ltrim(event."phone", '+'), 'UTF8')), 'hex')
FROM "inbox_event" AS ie
JOIN "channel" AS ch ON ch."phone_number_id" = ie."phone_number_id"
CROSS JOIN LATERAL (
  SELECT CASE ie."field"
    WHEN 'messages' THEN ie."payload" #> '{value,messages,0}'
    WHEN 'smb_message_echoes' THEN ie."payload" #> '{value,message_echoes,0}'
  END AS "payload",
  CASE ie."field" WHEN 'messages' THEN 'inbound' WHEN 'smb_message_echoes' THEN 'outbound' END AS "direction",
  CASE ie."field"
    WHEN 'messages' THEN ie."payload" #>> '{value,messages,0,from}'
    WHEN 'smb_message_echoes' THEN ie."payload" #>> '{value,message_echoes,0,to}'
  END AS "phone"
) AS event
WHERE mc."contact_address_hash" IS NULL AND ch."tenant_id" = mc."tenant_id"
  AND event."direction" = mc."direction" AND event."payload" ->> 'id' = mc."wamid"
  AND event."payload" ->> 'type' = mc."kind"
  AND coalesce(event."payload" #>> '{edit,original_message_id}', event."payload" #>> '{revoke,original_message_id}') = mc."original_wamid"
  AND event."phone" ~ '^\+?[0-9]{1,20}$';
--> statement-breakpoint
-- Refuse deployment if legacy content cannot be attributed safely. Do not
-- silently retain personal text or discard unrelated Contacts' changes.
ALTER TABLE "message_change" ALTER COLUMN "contact_address_hash" SET NOT NULL;
--> statement-breakpoint
CREATE INDEX "message_change_tenant_id_contact_address_hash_idx" ON "message_change" ("tenant_id","contact_address_hash");
