// The combined size of every FAQ pair and section, shown to the Tenant in
// characters because characters do not depend on the provider. Profile fields
// are behaviour settings and do not count.
export const knowledgeBaseCharacterCap = 30_000;

// Counts characters, not UTF-16 units, so "é" or an emoji counts as one.
export const characterCount = (text: string) => [...text].length;

export const entrySize = ({ title, body }: { title: string; body: string }) =>
  characterCount(title) + characterCount(body);

export const knowledgeBaseSize = (entries: { title: string; body: string }[]) =>
  entries.reduce((total, entry) => total + entrySize(entry), 0);
