// A Tenant's single Knowledge base: the owner edits its FAQ pairs and titled
// sections within a character cap, and the Bot reads what is saved.
export { knowledgeBaseCharacterCap } from "@/modules/knowledge-base/allowance";
export { createKnowledgeBaseEditor, entryTitleMaxLength, type NewKnowledgeBaseEntry } from "@/modules/knowledge-base/editor";
export { readKnowledgeBase } from "@/modules/knowledge-base/reader";
