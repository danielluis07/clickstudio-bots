export type KnowledgeEntryKind = "faq" | "section";

// What the editor calls each kind of entry and its two fields.
export const knowledgeEntryLabels: Record<KnowledgeEntryKind, {
  heading: string;
  description: string;
  title: string;
  body: string;
  add: string;
  empty: string;
}> = {
  faq: {
    heading: "Perguntas frequentes",
    description: "Perguntas que os Contatos costumam fazer, com a resposta que o Bot deve dar.",
    title: "Pergunta",
    body: "Resposta",
    add: "Adicionar pergunta",
    empty: "Nenhuma pergunta cadastrada.",
  },
  section: {
    heading: "Seções de texto",
    description: "Textos com título, como “Serviços e preços” ou “Políticas de cancelamento”.",
    title: "Título",
    body: "Texto",
    add: "Adicionar seção",
    empty: "Nenhuma seção cadastrada.",
  },
};

// Shown when the Member who last saved an entry has been removed.
export const entryEditorLabel = (updatedBy: string | null) => updatedBy ?? "Membro removido";
