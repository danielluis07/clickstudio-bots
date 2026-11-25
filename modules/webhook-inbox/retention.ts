import type { Database } from "@/db/database";
import { createInboxRepository } from "@/modules/webhook-inbox/repository";
import type { Clock } from "@/platform/clock";
import { daysBefore } from "@/platform/time";

export const pruneInboxEvents = (db: Database, clock: Clock) =>
  createInboxRepository(db).pruneBefore(daysBefore(clock.now(), 30));
