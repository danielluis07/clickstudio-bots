import { asc, eq, max, count } from "drizzle-orm";
import type { Database } from "@/db/database";
import { knowledgeBaseEntry } from "@/db/schema";
import type { BotTurn, KnowledgeBase } from "@/modules/bot";

// Readiness metadata without loading content or exposing table expressions.
export const readKnowledgeBaseReadiness = async (db: Database, scope: BotTurn["scope"]) => {
  const [saved] = await db
    .select({ entries: count(), updatedAt: max(knowledgeBaseEntry.updatedAt) })
    .from(knowledgeBaseEntry)
    .where(eq(knowledgeBaseEntry.tenantId, scope.tenantId));
  return { present: saved.entries > 0, updatedAt: saved.updatedAt };
};

// The Knowledge base as saved now, for a Bot turn's Tenant. Read on every
// turn with no cache of its own, so a saved edit reaches the next reply; the
// model provider's prompt cache is keyed by content, so it cannot go stale.
export const readKnowledgeBase = async (
  db: Database,
  scope: BotTurn["scope"],
): Promise<KnowledgeBase> => {
  const entries = await db
    .select({
      kind: knowledgeBaseEntry.kind,
      title: knowledgeBaseEntry.title,
      body: knowledgeBaseEntry.body,
    })
    .from(knowledgeBaseEntry)
    .where(eq(knowledgeBaseEntry.tenantId, scope.tenantId))
    .orderBy(asc(knowledgeBaseEntry.createdAt), asc(knowledgeBaseEntry.id));
  return {
    faqs: entries
      .filter(({ kind }) => kind === "faq")
      .map(({ title, body }) => ({ question: title, answer: body })),
    sections: entries
      .filter(({ kind }) => kind === "section")
      .map(({ title, body }) => ({ title, body })),
  };
};
