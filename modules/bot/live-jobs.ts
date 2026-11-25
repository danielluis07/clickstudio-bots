export type BotJob = { type: "run-bot-turn"; conversationId: string; delaySeconds?: number };
export interface BotJobQueue {
  enqueue(jobs: readonly BotJob[]): Promise<void>;
}
