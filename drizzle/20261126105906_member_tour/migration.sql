-- When each Member first skipped or finished the Tour (#251). Members who
-- exist at release count as having seen it, so it opens by itself only for
-- Members who join later; anyone can still replay it.
ALTER TABLE "member" ADD COLUMN "tour_seen_at" timestamp with time zone;--> statement-breakpoint
UPDATE "member" SET "tour_seen_at" = now();
