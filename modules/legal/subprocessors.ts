export const subprocessors = [
  {
    name: "Vercel",
    purpose: "Hospedagem do site, painel e processamento do atendimento.",
    categories: "Conteúdo de contatos e conversas, dados de membros, configurações e identificadores técnicos. Logs de execução apenas com identificadores.",
    location: "Leste dos Estados Unidos, região iad1 prevista para a aplicação.",
    source: "https://vercel.com/legal/dpa",
  },
  {
    name: "Neon",
    purpose: "Banco de dados e recuperação por backup.",
    categories: "Contatos, conversas, transcrições, campos capturados, base de conhecimento, dados de membros e tokens criptografados da Meta.",
    location: "Leste dos Estados Unidos, região us-east prevista para o banco.",
    source: "https://neon.com/dpa",
  },
  {
    name: "Upstash QStash",
    purpose: "Agendamento, entrega e repetição de tarefas do serviço.",
    categories: "Somente identificadores de tarefas, negócios e conversas; sem texto de mensagens, telefones ou conteúdo do atendimento nos payloads.",
    location: "Estados Unidos (leste), região US East.",
    source: "https://upstash.com/docs/qstash/howto/multi-region",
  },
  {
    name: "Anthropic",
    purpose: "Geração das respostas do Bot pela API comercial. Provedora prevista nesta minuta, condicionada à avaliação antes do lançamento.",
    categories: "Base de conhecimento, contexto necessário das conversas, transcrições e campos capturados. Sem número de telefone como campo estruturado.",
    location: "Estados Unidos; processamento internacional conforme a infraestrutura e os subprocessadores da provedora.",
    source: "https://privacy.anthropic.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data",
  },
  {
    name: "Groq",
    purpose: "Transcrição de mensagens de voz, com retenção zero habilitada para o conteúdo.",
    categories: "Áudio temporário e transcrição; metadados técnicos de uso. O arquivo de áudio não é armazenado pela ClickStudio.",
    location: "Estados Unidos, processamento pela API GroqCloud.",
    source: "https://console.groq.com/docs/your-data",
  },
  {
    name: "Resend",
    purpose: "E-mails de convite, recuperação de acesso e avisos de uso para membros.",
    categories: "Nome e e-mail dos membros, conteúdo transacional necessário e metadados de entrega; sem conversas ou conteúdo dos contatos.",
    location: "Estados Unidos para armazenamento; a região de envio de e-mail não altera o local de armazenamento.",
    source: "https://resend.com/security/gdpr",
  },
  {
    name: "Ably",
    purpose: "Atualizações em tempo real no painel.",
    categories: "Somente identificadores e sinais de atualização; sem conteúdo de mensagens ou telefones nos eventos.",
    location: "Rede global, incluindo Estados Unidos e União Europeia; sem restrição regional definida nesta minuta.",
    source: "https://ably.com/data-protection",
  },
  {
    name: "Sentry",
    purpose: "Diagnóstico de erros do serviço.",
    categories: "Identificadores e informações técnicas após remoção de corpos de requisição, textos de mensagens e telefones, com coleta padrão de dados pessoais desativada.",
    location: "União Europeia, região EU prevista para a organização.",
    source: "https://docs.sentry.io/organization/data-storage-location/",
  },
] as const;

export const retentionSources = [
  { label: "Janela de recuperação do Neon", href: "https://neon.com/docs/postgres/backup-restore/history-window" },
  { label: "Retenção de logs da Vercel", href: "https://vercel.com/docs/logs/runtime" },
  { label: "Armazenamento de mensagens do Ably", href: "https://ably.com/docs/storage-history/storage" },
  { label: "Mensagens e fila de falhas do QStash", href: "https://upstash.com/pricing/qstash" },
] as const;
