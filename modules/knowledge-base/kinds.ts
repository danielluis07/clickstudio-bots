// An FAQ pair (title is the question, body the answer) or a titled section.
export const knowledgeEntryKinds = ["faq", "section"] as const;

export type KnowledgeEntryKind = (typeof knowledgeEntryKinds)[number];
