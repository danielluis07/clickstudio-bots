import {
  disabledCapture,
  disabledLinks,
  type BehaviourSettings,
  type BotRepository,
  type BotConfiguration,
  type BotTurn,
  type BotAllowance,
  type ContextMessage,
  type KnowledgeBase,
  type TurnUsage,
  type UsageMeter,
} from "@/modules/bot";
import { noContactDetails, type ContactDetails } from "@/modules/conversations";

// Complete allowance for tests that vary reply permission independently of usage.
export const createTestBotAllowance = (
  canReply: BotAllowance["canReply"] = async () => true,
): BotAllowance => ({
  canReply,
  reserve: async () => {},
  notifyWarning: async () => {},
});

export const testBehaviour: BehaviourSettings = {
  businessName: "Barbearia Navalha",
  offer: "Cortes de cabelo e barba",
  hours: {
    monday: null,
    tuesday: { opens: "09:00", closes: "19:00" },
    wednesday: { opens: "09:00", closes: "19:00" },
    thursday: { opens: "09:00", closes: "19:00" },
    friday: { opens: "09:00", closes: "19:00" },
    saturday: { opens: "09:00", closes: "19:00" },
    sunday: null,
  },
  address: "Rua das Flores, 100, São Paulo",
  tone: "casual",
  emoji: false,
  greeting: "Olá! Aqui é a Barbearia Navalha.",
  rules: "Não marcamos horário pelo WhatsApp; envie o link de agendamento.",
  refusedTopics: ["política"],
  handoffTopics: ["reclamações"],
  schedule: "always",
};

export const testKnowledgeBase: KnowledgeBase = {
  faqs: [{ question: "Quanto custa o corte?", answer: "O corte custa R$ 80." }],
  sections: [{ title: "Pagamento", body: "Aceitamos PIX e cartão." }],
};

export type TestBotRepository = BotRepository &
  BotConfiguration & {
    // The turn's Contact as saved; captured details are merged in.
    contact: ContactDetails;
    // Every capture the core saved, in order.
    captured: Partial<ContactDetails>[];
    // Every message of the Conversation, whatever the core asks for.
    messages: ContextMessage[];
    turns: BotTurn[];
  };

// Hands the core one Conversation's saved settings, Knowledge base and
// messages. It applies no caps, so the core must apply them itself.
export const createTestBotRepository = (): TestBotRepository => {
  const repository: TestBotRepository = {
    behaviour: testBehaviour,
    knowledgeBase: testKnowledgeBase,
    capture: disabledCapture,
    links: disabledLinks,
    contact: noContactDetails,
    captured: [],
    messages: [],
    turns: [],
    getConfiguration: async (turn) => {
      repository.turns.push(turn);
      const { behaviour, knowledgeBase, capture, links } = repository;
      return { behaviour, knowledgeBase, capture, links };
    },
    getContactDetails: async () => repository.contact,
    saveContactDetails: async (_turn, details) => {
      repository.captured.push(details);
      repository.contact = { ...repository.contact, ...details };
    },
    listRecentMessages: async () => repository.messages,
  };
  return repository;
};

export type TestUsageMeter = UsageMeter & {
  records: { tenantId: string; at: Date; usage: TurnUsage }[];
  failNext(): void;
};

export const createTestUsageMeter = (): TestUsageMeter => {
  const records: TestUsageMeter["records"] = [];
  let shouldFail = false;
  return {
    records,
    failNext: () => {
      shouldFail = true;
    },
    record: async ({ tenantId }, at, usage) => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error("Meter unavailable");
      }
      records.push({ tenantId, at, usage });
    },
  };
};
