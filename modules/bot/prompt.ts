import { memberLabel } from "@/modules/bot/context";
import type { BehaviourSettings, KnowledgeBase } from "@/modules/bot/repository";

// Instructions to the model are English; the Tenant's own content is quoted
// as written, and the Bot replies to Contacts in pt-BR.
// Both blocks must render identically for unchanged settings, or every turn
// pays a cache write.

const tones: Record<BehaviourSettings["tone"], string> = {
  formal: "formal and polite",
  neutral: "neutral and friendly",
  casual: "casual and warm",
};

const policy = `You are the Bot of the business described below. You reply to its Contacts, the people who message it on WhatsApp, in Brazilian Portuguese.

- Answer only from the business profile and the Knowledge base. Never infer or invent prices, dates, availability, discounts, policies, bookings or payments they do not state, and never claim a booking or payment is confirmed.
- When the answer is not there, or entries contradict each other, call the handoff tool with reason "sem_resposta". Do not first ask whether the Contact wants a person.
- When a message mixes questions you can answer with ones you cannot, answer what you can and call handoff with "sem_resposta" for the rest, in the same reply.
- When the Contact asks for a person, call handoff with "pedido_do_contato".
- When a message touches a topic the business hands to its team, call handoff with "regra_do_negocio". Politely decline refused topics without a handoff.
- When you call handoff, a short notice that the team will reply is added after your text. Do not write one yourself: write only what you can answer, or nothing.
- Messages starting with "${memberLabel}" were written by a member of the business's team, not by you. Never start your own replies with it.
- Keep replies short and suited to WhatsApp.`;

const line = (label: string, value: string) => (value.trim() ? `${label}: ${value.trim()}` : null);

const joinPresent = (lines: (string | null)[]) =>
  lines.filter((value) => value !== null).join("\n");

export const renderInstructions = (behaviour: BehaviourSettings) =>
  joinPresent([
    policy,
    "",
    "# Style",
    `Tone: ${tones[behaviour.tone]}.`,
    behaviour.emoji ? "Emoji: allowed, sparingly." : "Emoji: never use them.",
    line("Greeting to use when a Contact first writes", behaviour.greeting),
    "",
    "# Business profile",
    line("Name", behaviour.businessName),
    line("Offer", behaviour.offer),
    line("Hours", behaviour.hours),
    line("Address", behaviour.address),
    "",
    "# Business rules",
    behaviour.rules.trim() || "None.",
    line("Refused topics", behaviour.refusedTopics.join("; ")),
    line("Topics handed to the team", behaviour.handoffTopics.join("; ")),
  ]);

export const renderKnowledgeBase = ({ faqs, sections }: KnowledgeBase) =>
  [
    "# Knowledge base",
    ...faqs.map(({ question, answer }) => `## Question: ${question.trim()}\n${answer.trim()}`),
    ...sections.map(({ title, body }) => `## ${title.trim()}\n${body.trim()}`),
  ].join("\n\n");
