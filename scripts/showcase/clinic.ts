// The showcase Tenant: a made-up dental clinic in São Paulo. Every name,
// address and link here is fictitious.
export const clinic = {
  slug: "odonto-alameda",
  name: "Odonto Alameda",
  emailDomain: "odonto-alameda.example.com",
  wabaId: "999000000000102",
  phoneNumberId: "999000000000101",
  displayPhoneNumber: "+55 11 90000-1010",
  bookingUrl: "https://agenda.example.com/odonto-alameda",
} as const;

export const team = {
  owner: { name: "Mariana Costa", local: "mariana", role: "owner" },
  others: [
    { name: "Rafael Nunes", local: "rafael", role: "admin" },
    { name: "Juliana Prado", local: "juliana", role: "member" },
  ],
} as const;

export const businessHours = {
  monday: { opens: "08:00", closes: "19:00" },
  tuesday: { opens: "08:00", closes: "19:00" },
  wednesday: { opens: "08:00", closes: "19:00" },
  thursday: { opens: "08:00", closes: "19:00" },
  friday: { opens: "08:00", closes: "19:00" },
  saturday: { opens: "08:00", closes: "13:00" },
  sunday: null,
};

export const botProfile = {
  businessName: clinic.name,
  offer:
    "Clínica odontológica com clínico geral, ortodontia (aparelho fixo e alinhadores), implantes, clareamento e odontopediatria. Primeira avaliação gratuita.",
  address:
    "Rua Domingos de Morais, 1.250, sala 32 — Vila Mariana, São Paulo (SP). A 300 m do metrô Vila Mariana.",
  hours: businessHours,
};

export const botBehaviour = {
  tone: "neutral" as const,
  emoji: true,
  greeting: "Olá! Aqui é a assistente virtual da Odonto Alameda 😊 Como posso ajudar?",
  rules:
    "Nunca dê diagnóstico nem receite medicamentos. Para preço de tratamentos que dependem de avaliação (implante, ortodontia, prótese), explique que o valor é definido na avaliação gratuita. Sempre ofereça o link de agendamento quando o Contato quiser marcar.",
  refusedTopics: ["Diagnóstico pelo WhatsApp", "Receita de medicamentos"],
  handoffTopics: [
    "Reclamação",
    "Orçamento de tratamento em andamento",
    "Cancelamento de tratamento",
    "Nota fiscal e reembolso",
  ],
  schedule: "always" as const,
};

export const captureFields = {
  name: "optional",
  email: "off",
  city: "optional",
  need: "required",
} as const;

export const links = [
  { id: "agenda", label: "Agendar consulta", url: clinic.bookingUrl },
  { id: "mapa", label: "Como chegar", url: "https://maps.example.com/odonto-alameda" },
  { id: "instagram", label: "Instagram", url: "https://instagram.example.com/odontoalameda" },
];

export const knowledgeBase: { kind: "faq" | "section"; title: string; body: string }[] = [
  {
    kind: "section",
    title: "Sobre a clínica",
    body: "A Odonto Alameda atende na Vila Mariana desde 2014. Equipe com clínico geral, ortodontista, implantodontista e odontopediatra. Atendemos adultos e crianças a partir de 3 anos.",
  },
  {
    kind: "faq",
    title: "Qual o horário de atendimento?",
    body: "Segunda a sexta, das 8h às 19h, e sábado, das 8h às 13h. Não abrimos aos domingos e feriados.",
  },
  {
    kind: "faq",
    title: "Quanto custa uma limpeza?",
    body: "A limpeza (profilaxia) custa R$ 180 e inclui a aplicação de flúor. Para pacientes em tratamento ortodôntico na clínica, sai por R$ 140.",
  },
  {
    kind: "faq",
    title: "A avaliação é gratuita?",
    body: "Sim. A primeira avaliação é gratuita e dura cerca de 40 minutos, com plano de tratamento e orçamento por escrito.",
  },
  {
    kind: "faq",
    title: "Vocês aceitam convênio?",
    body: "Atendemos particular e emitimos nota fiscal com os códigos dos procedimentos para pedir reembolso ao seu convênio odontológico.",
  },
  {
    kind: "faq",
    title: "Quais as formas de pagamento?",
    body: "Pix, débito e cartão de crédito em até 10 vezes sem juros para tratamentos acima de R$ 1.000. Pix à vista tem 5% de desconto.",
  },
  {
    kind: "faq",
    title: "Quanto custa o clareamento?",
    body: "Clareamento caseiro com moldeiras: R$ 650. Clareamento em consultório (2 sessões): R$ 900. Combinado (consultório + caseiro): R$ 1.300.",
  },
  {
    kind: "faq",
    title: "Vocês fazem alinhadores invisíveis?",
    body: "Sim. O valor depende do caso e é definido na avaliação ortodôntica gratuita, com escaneamento digital.",
  },
  {
    kind: "faq",
    title: "Atendem urgência?",
    body: "Sim, encaixamos urgências (dor, dente quebrado, inchaço) no mesmo dia, durante o horário de atendimento. Fora do horário, oriente procurar um pronto-socorro odontológico.",
  },
  {
    kind: "faq",
    title: "Tem estacionamento?",
    body: "Temos convênio com o estacionamento do prédio: R$ 12 pelas primeiras 2 horas. O metrô Vila Mariana fica a 300 m.",
  },
  {
    kind: "section",
    title: "Cuidados após extração",
    body: "Nas primeiras 24 horas: não bochechar, não cuspir, não usar canudo e evitar alimentos quentes. Compressa de gelo por 20 minutos nas primeiras horas. Sangramento leve é normal; se for intenso ou houver febre, entre em contato.",
  },
];
