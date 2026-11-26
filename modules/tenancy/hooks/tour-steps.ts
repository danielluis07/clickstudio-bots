import type { MemberRole } from "@/modules/tenancy/scope";

export type TourStepId =
  | "welcome"
  | "overview"
  | "conversations"
  | "knowledge-base"
  | "bot-profile"
  | "bot-links"
  | "bot-activation"
  | "settings"
  | "header"
  | "alert-bell"
  | "alert-preferences"
  | "first-steps"
  | "replay";

// The `data-tour` names the dashboard puts on what the Tour highlights.
export type TourTargetId =
  | "nav-overview"
  | "nav-conversations"
  | "nav-knowledge-base"
  | "nav-bot-profile"
  | "nav-bot-links"
  | "nav-bot-activation"
  | "nav-settings"
  | "header-status"
  | "alert-bell"
  | "first-steps"
  | "replay";

export type TourStep = {
  id: TourStepId;
  // What the step highlights; null for a step attached to nothing, shown in
  // the middle of the screen.
  target: TourTargetId | null;
  // Whether the target is in the sidebar, which on a phone is a panel that
  // has to slide out before the step can show it.
  inSidebar: boolean;
  title: string;
  description: string;
};

const welcome = {
  id: "welcome",
  target: null,
  inSidebar: true,
  title: "Boas-vindas ao painel",
} as const;

const conversations: TourStep = {
  id: "conversations",
  target: "nav-conversations",
  inSidebar: true,
  title: "Conversas",
  description:
    "Todas as conversas com os contatos. Assuma uma conversa no lugar do Bot, devolva-a ao Bot quando terminar e edite os dados do contato.",
};

const replay: TourStep = {
  id: "replay",
  target: "replay",
  inSidebar: true,
  title: "Ver tour",
  description: "Quando quiser rever este tour, é só clicar aqui.",
};

const ownerSteps: TourStep[] = [
  {
    ...welcome,
    description:
      "O Bot responde seus contatos no WhatsApp e no Instagram. Por aqui você acompanha as conversas e assume quando precisar. Vamos conhecer cada área?",
  },
  {
    id: "overview",
    target: "nav-overview",
    inSidebar: true,
    title: "Visão geral",
    description:
      "Um resumo do atendimento: as conversas ativas no período, as respostas do Bot usadas no mês e os últimos Handoffs.",
  },
  conversations,
  {
    id: "knowledge-base",
    target: "nav-knowledge-base",
    inSidebar: true,
    title: "Base de conhecimento",
    description:
      "Perguntas frequentes e seções de texto sobre o seu negócio. O Bot responde somente com o que estiver aqui.",
  },
  {
    id: "bot-profile",
    target: "nav-bot-profile",
    inSidebar: true,
    title: "Perfil do negócio e Comportamento",
    description:
      "Conte quem é o seu negócio e qual é o horário de atendimento. Depois escolha o tom do Bot, as regras, os assuntos que ele recusa, os que ele passa para a equipe e quando ele responde.",
  },
  {
    id: "bot-links",
    target: "nav-bot-links",
    inSidebar: true,
    title: "Contatos e links e Testar",
    description:
      "Os dados que o Bot pede aos contatos e os links que ele compartilha. Em Testar, converse com o Bot em particular antes de colocá-lo no ar.",
  },
  {
    id: "bot-activation",
    target: "nav-bot-activation",
    inSidebar: true,
    title: "Ativação",
    description: "Aqui você liga e desliga o Bot. Ele só responde os contatos depois de ativado.",
  },
  {
    id: "settings",
    target: "nav-settings",
    inSidebar: true,
    title: "Configurações",
    description:
      "O canal do WhatsApp, os convites para a sua equipe e as suas preferências de alertas.",
  },
  {
    id: "header",
    target: "header-status",
    inSidebar: false,
    title: "Canal e alertas",
    description:
      "Aqui você vê se o WhatsApp está conectado. No sino ficam os alertas de Handoffs e de mensagens novas.",
  },
];

const firstSteps: TourStep = {
  id: "first-steps",
  target: "first-steps",
  inSidebar: false,
  title: "Comece por aqui",
  description: "Siga os Primeiros passos para colocar o Bot no ar.",
};

const attendantSteps: TourStep[] = [
  {
    ...welcome,
    description:
      "O Bot responde os contatos no WhatsApp e no Instagram. Você acompanha as conversas e assume quando um contato precisar de uma pessoa. Vamos conhecer o painel?",
  },
  {
    id: "overview",
    target: "nav-overview",
    inSidebar: true,
    title: "Visão geral",
    description: "Um resumo do atendimento: as conversas ativas no período e os últimos Handoffs.",
  },
  conversations,
  {
    id: "alert-bell",
    target: "alert-bell",
    inSidebar: false,
    title: "Alertas",
    description:
      "O sino avisa quando o Bot passa uma conversa para a equipe e quando chegam mensagens novas.",
  },
  {
    id: "alert-preferences",
    target: "nav-settings",
    inSidebar: true,
    title: "Configurações",
    description:
      "Em Notificações, escolha quais alertas você recebe e se eles tocam um som ou aparecem como notificação do navegador.",
  },
  replay,
];

// The Tour's script for a Member. An owner sees every area and, while the Bot
// is not live, ends at Primeiros passos; anyone else sees only what they can
// use. Each step only explains: none of them changes anything.
export const tourSteps = ({ role, botLive }: { role: MemberRole; botLive: boolean }): TourStep[] =>
  role === "owner" ? [...ownerSteps, botLive ? replay : firstSteps] : attendantSteps;
