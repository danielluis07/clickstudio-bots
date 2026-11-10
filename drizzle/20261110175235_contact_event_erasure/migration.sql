ALTER TABLE "inbox_event" ADD COLUMN "contact_phone" text GENERATED ALWAYS AS (ltrim(coalesce(
        payload #>> '{value,messages,0,from}',
        payload #>> '{value,statuses,0,recipient_id}',
        payload #>> '{value,message_echoes,0,to}',
        payload #>> '{value,history,0,threads,0,id}',
        payload #>> '{value,state_sync,0,contact,phone_number}'
      ), '+')) STORED;--> statement-breakpoint
CREATE INDEX "inbox_event_contact_idx" ON "inbox_event" ("phone_number_id","contact_phone");