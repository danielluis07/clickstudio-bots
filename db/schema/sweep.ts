import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// When the sweep (ADR 0007) last finished, in its one row (#182). The daily
// cron reads it to notice a sweep that stopped running.
export const sweepRun = pgTable(
  "sweep_run",
  {
    id: text("id").primaryKey().default("sweep"),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
  },
  (t) => [check("sweep_run_single_row", sql`${t.id} = 'sweep'`)],
);
