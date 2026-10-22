import type { Job } from "@/modules/webhook-inbox";

export type TestJobQueue<Queued = Job> = {
  enqueue(jobs: readonly Queued[]): Promise<void>;
  jobs: Queued[];
  failing: boolean;
  // Removes and returns everything enqueued so far, as QStash would deliver it.
  take(): Queued[];
};

export const createTestJobQueue = <Queued = Job>(): TestJobQueue<Queued> => {
  const queue: TestJobQueue<Queued> = {
    jobs: [],
    failing: false,
    async enqueue(jobs) {
      if (queue.failing) throw new Error("queue unavailable");
      queue.jobs.push(...jobs);
    },
    take() {
      return queue.jobs.splice(0);
    },
  };
  return queue;
};
