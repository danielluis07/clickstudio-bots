import type { Database } from "@/db/database";
import { createInboxRepository } from "@/modules/webhook-inbox/repository";
import type { Clock } from "@/platform/clock";

export const pruneInboxEvents = (db: Database, clock: Clock) =>
  createInboxRepository(db).pruneBefore(new Date(clock.now().getTime() - 30 * 24 * 60 * 60 * 1000));
