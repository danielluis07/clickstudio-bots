import type { Job, JobQueue } from "@/modules/webhook-inbox";

export type TestJobQueue = JobQueue & {
  jobs: Job[];
  failing: boolean;
  // Removes and returns everything enqueued so far, as QStash would deliver it.
  take(): Job[];
};

export const createTestJobQueue = (): TestJobQueue => {
  const queue: TestJobQueue = {
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
