import type { Database } from "@/db/database";
import { readCapture } from "@/modules/bot/capture";
import { readLinks } from "@/modules/bot/links";
import type { BotTurn } from "@/modules/bot/repository";
import { readBehaviour } from "@/modules/bot/settings";
import { readKnowledgeBase } from "@/modules/knowledge-base";

// Read the current saved configuration on every turn. Keep the Knowledge base
// behind its own module's reader and the independent reads concurrent.
export const readBotConfiguration = async (db: Database, scope: BotTurn["scope"]) => {
  const [behaviour, knowledgeBase, capture, links] = await Promise.all([
    readBehaviour(db, scope),
    readKnowledgeBase(db, scope),
    readCapture(db, scope),
    readLinks(db, scope),
  ]);
  return { behaviour, knowledgeBase, capture, links };
};

export type BotConfiguration = Awaited<ReturnType<typeof readBotConfiguration>>;
