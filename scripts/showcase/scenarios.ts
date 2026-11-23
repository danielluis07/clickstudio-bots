import { clinic } from "@/scripts/showcase/clinic";
import type { Random } from "@/scripts/showcase/random";

// One step of a day's exchange. A team or app message from a Conversation the
// Bot owns hands it off ("dashboard_reply", "app_reply"), and so does a claim.
export type Step =
  | { by: "contact"; text: string }
  | { by: "bot"; text: string; handoff?: "contact_request" | "handoff_topic" | "no_answer" }
  | { by: "team"; text: string }
  | { by: "app"; text: string }
  | { by: "claim" };

export type ScenarioContext = {
  random: Random;
  first: string;
  fullName: string;
  // The Member who answers, with the article: "a Juliana", "o Rafael".
  member: string;
  // "Bom dia", "Boa tarde" or "Boa noite", from the hour the exchange starts.
  hi: string;
  // A weekday a few days ahead, such as "quinta".
  day: string;
};

// `need` is what the Bot captures as the Contact's need, when it does.
export type Scenario = { weight: number; need?: string; steps: (c: ScenarioContext) => Step[] };

const contact = (text: string): Step => ({ by: "contact", text });
const bot = (text: string, handoff?: "contact_request" | "handoff_topic" | "no_answer"): Step => ({
  by: "bot",
  text,
  handoff,
});
const team = (text: string): Step => ({ by: "team", text });
const app = (text: string): Step => ({ by: "app", text });

const opener = (c: ScenarioContext) =>
  c.random.pick([`${c.hi}!`, `${c.hi}, tudo bem?`, "Oi", "Olá", "Oii", `${c.hi}`]);
const thanks = (c: ScenarioContext) =>
  c.random.pick([
    "Obrigada!",
    "Obrigado!",
    "Muito obrigada 🙏",
    "Valeu!",
    "Perfeito, obrigada",
    "Ok, obrigado!",
  ]);
const welcome = (c: ScenarioContext) =>
  c.random.pick([
    "Por nada! Qualquer dúvida é só chamar 😊",
    `Imagina, ${c.first}! Estamos à disposição.`,
    "Disponha! Até breve 😊",
  ]);
const hour = (c: ScenarioContext) => c.random.pick(["9h", "10h30", "14h", "15h30", "17h", "18h"]);

// Exchanges the Bot settles alone, for a Contact writing for the first time.
const firstContactBotOnly: Scenario[] = [
  {
    weight: 10,
    need: "Limpeza",
    steps: (c) => [
      contact(`${opener(c)} Qual o valor da limpeza?`),
      bot(
        `${c.hi}! A limpeza custa R$ 180 e já inclui a aplicação de flúor. Quer agendar? É só escolher o melhor horário aqui: ${clinic.bookingUrl}`,
      ),
      contact(c.random.pick(["Aceita cartão?", "Dá pra parcelar?", "Pode ser no pix?"])),
      bot("Aceitamos Pix, débito e crédito. No Pix à vista você tem 5% de desconto 😊"),
      contact(thanks(c)),
      bot(welcome(c)),
    ],
  },
  {
    weight: 9,
    steps: (c) => [
      contact(
        c.random.pick([
          "Vocês abrem sábado?",
          "Qual o horário de vocês?",
          "Até que horas vocês atendem?",
        ]),
      ),
      bot(
        "Atendemos de segunda a sexta, das 8h às 19h, e aos sábados, das 8h às 13h. Domingos e feriados a clínica fica fechada.",
      ),
      contact(thanks(c)),
      bot(welcome(c)),
    ],
  },
  {
    weight: 8,
    need: "Avaliação geral",
    steps: (c) => [
      contact(`${opener(c)} Gostaria de marcar uma avaliação`),
      bot(
        `Que bom, ${c.first}! A primeira avaliação é gratuita e dura cerca de 40 minutos. Você pode escolher o horário direto pela agenda: ${clinic.bookingUrl}\n\nMe conta rapidinho o que você gostaria de avaliar?`,
      ),
      contact(
        c.random.pick([
          "Estou com um dente sensível no frio",
          "Queria ver sobre aparelho",
          "Faz tempo que não vou no dentista, queria um check-up",
          "Quero ver se preciso tirar o siso",
        ]),
      ),
      bot(
        "Anotado! Na avaliação o dentista examina com calma e já sai com o plano de tratamento e o orçamento por escrito. Te esperamos!",
      ),
      contact(
        c.random.pick([
          "Marquei pra " + c.day + " às " + hour(c),
          "Agendei, obrigada!",
          "Pronto, consegui marcar",
        ]),
      ),
      bot(`Perfeito! Você vai receber a confirmação por aqui um dia antes. Até ${c.day}! 😊`),
    ],
  },
  {
    weight: 7,
    need: "Clareamento",
    steps: (c) => [
      contact(`${opener(c)} Quanto custa clareamento?`),
      bot(
        "Temos três opções:\n• Caseiro com moldeiras: R$ 650\n• Em consultório (2 sessões): R$ 900\n• Combinado (consultório + caseiro): R$ 1.300\n\nAntes do clareamento fazemos uma avaliação gratuita para ver se está tudo certo com os dentes.",
      ),
      contact("Qual dá mais resultado?"),
      bot(
        "O combinado costuma dar o resultado mais rápido e duradouro, mas a indicação certa depende de cada caso — o dentista orienta na avaliação. Quer agendar?",
      ),
      contact("Vou ver aqui e te falo"),
      bot(`Combinado! Quando quiser, é só escolher o horário aqui: ${clinic.bookingUrl}`),
    ],
  },
  {
    weight: 6,
    steps: (c) => [
      contact(
        c.random.pick([
          "Vcs aceitam convênio?",
          "Atende plano odontológico?",
          "Vocês trabalham com convênio?",
        ]),
      ),
      bot(
        "Atendemos particular e emitimos nota fiscal com os códigos de cada procedimento, para você pedir o reembolso ao seu convênio odontológico.",
      ),
      contact("Entendi. E a avaliação é paga?"),
      bot(`A primeira avaliação é gratuita! Pode agendar por aqui: ${clinic.bookingUrl}`),
    ],
  },
  {
    weight: 5,
    steps: (c) => [
      contact(`${opener(c)} Onde fica a clínica?`),
      bot(
        "Estamos na Rua Domingos de Morais, 1.250, sala 32, na Vila Mariana — a 300 m do metrô Vila Mariana. 📍 https://maps.example.com/odonto-alameda",
      ),
      contact("Tem estacionamento?"),
      bot("Temos convênio com o estacionamento do prédio: R$ 12 pelas primeiras 2 horas."),
    ],
  },
  {
    weight: 5,
    need: "Consulta para criança",
    steps: (c) => [
      contact("Vocês atendem criança?"),
      bot(
        "Atendemos sim, a partir de 3 anos, com nossa odontopediatra. Quantos anos tem a criança?",
      ),
      contact(c.random.pick(["5 anos", "Ela tem 7", "Ele fez 4 agora"])),
      bot(
        `Ótimo! A primeira consulta é uma avaliação tranquila, para a criança se acostumar com o ambiente. Pode marcar aqui: ${clinic.bookingUrl}`,
      ),
      contact(thanks(c)),
      bot(welcome(c)),
    ],
  },
  {
    weight: 5,
    need: "Avaliação para alinhadores",
    steps: () => [
      contact("Quanto fica um aparelho invisível?"),
      bot(
        "O valor dos alinhadores depende do caso e é definido na avaliação ortodôntica, que é gratuita e inclui o escaneamento digital dos dentes. Quer agendar?",
      ),
      contact("Parcela?"),
      bot(
        "Sim! Tratamentos acima de R$ 1.000 podem ser parcelados em até 10x sem juros no cartão.",
      ),
      contact("Vou agendar então"),
      bot(`Perfeito! É só escolher o horário aqui: ${clinic.bookingUrl} 😊`),
    ],
  },
  {
    weight: 4,
    need: "Implante",
    steps: (c) => [
      contact(c.random.pick(["Quanto custa um implante?", "Queria saber o preço de implante"])),
      bot(
        "O valor do implante depende de cada caso (osso, número de dentes, tipo de prótese), por isso é definido na avaliação gratuita, com orçamento por escrito. Quer marcar?",
      ),
      contact("Pode ser"),
      bot(`Ótimo! Escolha o melhor horário aqui: ${clinic.bookingUrl}`),
    ],
  },
  {
    weight: 4,
    need: "Dor de dente (urgência)",
    steps: (c) => [
      contact("Estou com muita dor de dente, vocês atendem hoje?"),
      bot(
        "Sinto muito pela dor! Encaixamos urgências no mesmo dia durante o horário de atendimento. Me diz seu nome completo que já aviso a recepção?",
      ),
      contact(c.fullName),
      bot(
        `Obrigada, ${c.first}! Pode vir direto para a clínica que vamos te encaixar. Estamos na Rua Domingos de Morais, 1.250, sala 32.`,
      ),
    ],
  },
];

// Exchanges that end with the team, for a Contact writing for the first time.
const firstContactHandoff: Scenario[] = [
  {
    weight: 5,
    steps: (c) => [
      contact(`${opener(c)} Consigo falar com alguém da recepção?`),
      bot(
        "Claro! Vou chamar alguém da equipe para continuar com você. Só um instante 😊",
        "contact_request",
      ),
      team(`Oi, ${c.first}! Aqui é ${c.member}, da recepção. Em que posso ajudar?`),
      contact("Queria saber se a Dra. Mariana atende na segunda de manhã"),
      team(`Atende sim! Tenho horário às ${hour(c)} de segunda. Quer que eu reserve?`),
      contact("Pode reservar, por favor"),
      team("Prontinho, reservado! Te mando a confirmação no dia anterior."),
    ],
  },
  {
    weight: 3,
    steps: (c) => [
      contact("Vocês fazem lente de contato dental em resina?"),
      bot(
        "Não tenho essa informação aqui, mas a equipe vai te responder em instantes!",
        "no_answer",
      ),
      team(
        `Oi, ${c.first}! Fazemos sim, em resina e em porcelana. O valor depende da quantidade de dentes — na avaliação gratuita a gente já te passa o orçamento.`,
      ),
      contact("Ah legal, vou marcar"),
    ],
  },
];

// Exchanges with a Contact who has written before.
const returningBotOnly: Scenario[] = [
  {
    weight: 8,
    steps: (c) => [
      contact(
        c.random.pick([
          "Confirmado!",
          "Confirmo sim",
          "Sim, confirmo a consulta de amanhã",
          "Confirmo 👍",
        ]),
      ),
      bot(`Obrigada por confirmar, ${c.first}! Te esperamos amanhã 😊`),
    ],
  },
  {
    weight: 5,
    steps: (c) => [
      contact("Preciso remarcar minha consulta"),
      bot(
        `Sem problemas! Você pode escolher um novo horário direto pela agenda: ${clinic.bookingUrl}`,
      ),
      contact(thanks(c)),
      bot(welcome(c)),
    ],
  },
  {
    weight: 4,
    steps: (c) => [
      contact("Tirei o siso ontem, posso tomar café quente?"),
      bot(
        "Nas primeiras 24 horas é melhor evitar alimentos e bebidas quentes, não bochechar, não cuspir e não usar canudo. Compressa de gelo ajuda com o inchaço. Se o sangramento for intenso ou tiver febre, nos avise!",
      ),
      contact("Ok, obrigada"),
      bot(`Melhoras, ${c.first}! 🙏`),
    ],
  },
  {
    weight: 3,
    steps: (c) => [
      contact(`${opener(c)} Qual o valor da limpeza pra quem usa aparelho com vocês?`),
      bot("Para pacientes em tratamento ortodôntico aqui na clínica, a limpeza sai por R$ 140."),
      contact(thanks(c)),
      bot(welcome(c)),
    ],
  },
];

const returningHandoff: Scenario[] = [
  {
    weight: 3,
    steps: (c) => [
      contact("Preciso da nota fiscal da minha última consulta pra pedir reembolso"),
      bot(
        "Vou passar para a equipe da recepção, que cuida das notas fiscais. Já já alguém te responde!",
        "handoff_topic",
      ),
      team(`Oi, ${c.first}! Aqui é ${c.member}. Vou emitir agora e te mando por aqui, tudo bem?`),
      contact(thanks(c)),
      team("Enviei no seu e-mail cadastrado. Qualquer coisa me chama!"),
    ],
  },
  {
    weight: 2,
    steps: (c) => [
      contact("Quero rever o orçamento do meu tratamento, ficou acima do que eu esperava"),
      bot(
        "Entendo! Vou chamar alguém da equipe para conversar com você sobre o orçamento.",
        "handoff_topic",
      ),
      team(
        `Oi, ${c.first}, tudo bem? Aqui é ${c.member}. Conseguimos dividir o tratamento em duas etapas e parcelar em 10x. Posso te ligar pra explicar?`,
      ),
      contact("Pode sim, depois das 18h"),
    ],
  },
  {
    weight: 2,
    steps: (c) => [
      contact("Oi, a Dra. pediu pra eu mandar foto do raio-x"),
      bot("Recebido! Vou avisar a equipe para encaminhar à doutora."),
      { by: "claim" },
      team(
        `${c.first}, aqui é ${c.member}! Já passei para a Dra. Mariana, ela te retorna ainda hoje.`,
      ),
    ],
  },
  {
    weight: 2,
    steps: (c) => [
      contact(`${opener(c)} Minha consulta de ${c.day} está mantida?`),
      bot(`Está sim! Qualquer mudança a gente avisa por aqui.`),
      app(`Oi ${c.first}! Está confirmada sim 😊 Até ${c.day}!`),
    ],
  },
  {
    weight: 1,
    steps: (c) => [
      contact("Quero falar com uma pessoa, por favor"),
      bot("Claro! Já chamei alguém da equipe para continuar com você.", "contact_request"),
      team(`Oi, ${c.first}! Aqui é ${c.member}. Como posso ajudar?`),
    ],
  },
];

const draw = (random: Random, scenarios: Scenario[]) =>
  scenarios[random.weighted(scenarios.map(({ weight }) => weight))];

// About one exchange in six ends with the team.
const handoffShare = 0.17;

export const drawScenario = (random: Random, returning: boolean) => {
  const handoff = random.chance(handoffShare);
  const pool = returning
    ? handoff
      ? returningHandoff
      : returningBotOnly
    : handoff
      ? firstContactHandoff
      : firstContactBotOnly;
  return draw(random, pool);
};
