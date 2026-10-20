// Jobs carry ids only; handlers load everything else from the database.
export type Job = { type: "process-inbox-event"; inboxEventId: string };

// The core reaches QStash only through this port (ADR 0002).
export interface JobQueue {
  enqueue(jobs: readonly Job[]): Promise<void>;
}
