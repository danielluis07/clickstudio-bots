import { isLocalUrl, qstashJobUrl } from "@/platform/qstash";

export type DoctorEnvironment = Record<string, string | undefined>;
export type DoctorCheck = {
  name:
    | "environment"
    | "provider"
    | "database"
    | "migrations"
    | "owner"
    | "server"
    | "sweep_schedule"
    | "provider_probe";
  status: "pass" | "fail" | "skip";
  message: string;
};

export type DatabaseReadiness = {
  appliedMigrationNames: string[] | null;
  ownerAvailable: boolean;
};

export type SweepSchedule = { destination: string; paused: boolean };

export type DoctorDependencies = {
  migrationNames: string[];
  inspectDatabase(connectionString: string): Promise<DatabaseReadiness>;
  checkServer(origin: string): Promise<boolean>;
  // The QStash schedule with id `sweep`, read without changing it, or null.
  readSweepSchedule(environment: DoctorEnvironment): Promise<SweepSchedule | null>;
  probeProvider(environment: DoctorEnvironment, modelId?: string): Promise<void>;
};

const requiredEnvironment = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "APP_URL",
  "RESEND_API_KEY",
  "EMAIL_FROM",
];
const configured = (value: string | undefined) => Boolean(value?.trim());

const validUrl = (value: string | undefined, protocols: string[]) => {
  try {
    return protocols.includes(new URL(value ?? "").protocol);
  } catch {
    return false;
  }
};

export const defaultQStashUrl = "https://qstash-us-east-1.upstash.io";

// The sweep's schedule lives in QStash, not in the repository (ADR 0007).
// Without it nothing recovers stuck work, so its absence fails (#182).
const checkSweepSchedule = async (
  environment: DoctorEnvironment,
  dependencies: DoctorDependencies,
  appUrlValid: boolean,
  add: (name: DoctorCheck["name"], status: DoctorCheck["status"], message: string) => void,
) => {
  const qstashUrl = environment.QSTASH_URL?.trim() || defaultQStashUrl;
  if (!appUrlValid || !validUrl(qstashUrl, ["http:", "https:"])) {
    add(
      "sweep_schedule",
      "skip",
      "Configure APP_URL e QSTASH_URL válidas para verificar o agendamento da varredura.",
    );
    return;
  }
  if (!configured(environment.QSTASH_TOKEN)) {
    add(
      "sweep_schedule",
      "skip",
      "Configure QSTASH_TOKEN para verificar o agendamento da varredura.",
    );
    return;
  }
  if (isLocalUrl(environment.APP_URL!) && !isLocalUrl(qstashUrl)) {
    add(
      "sweep_schedule",
      "skip",
      "APP_URL é local e o QStash na nuvem não a alcança. Use a APP_URL e o QSTASH_TOKEN do ambiente publicado.",
    );
    return;
  }
  let schedule: SweepSchedule | null;
  try {
    schedule = await dependencies.readSweepSchedule(environment);
  } catch {
    add(
      "sweep_schedule",
      "fail",
      "Não foi possível consultar o QStash. Confira QSTASH_TOKEN, QSTASH_URL e a conexão.",
    );
    return;
  }
  const expected = qstashJobUrl(environment.APP_URL!, "sweep");
  add(
    "sweep_schedule",
    schedule && schedule.destination === expected && !schedule.paused ? "pass" : "fail",
    !schedule
      ? "O agendamento da varredura não existe no QStash. Crie-o com bun run sweep:schedule."
      : schedule.destination !== expected
        ? "O agendamento da varredura chama outra URL. Atualize-o com bun run sweep:schedule usando esta APP_URL."
        : schedule.paused
          ? "O agendamento da varredura está pausado. Retome-o no console do QStash."
          : "O agendamento da varredura existe e chama esta APP_URL.",
  );
};

// This public report contains diagnoses only, never environment values or raw
// errors: both may carry credentials. All external work is behind these ports.
export const runDoctor = async ({
  environment,
  dependencies,
  probeProvider = false,
  probeModelId,
}: {
  environment: DoctorEnvironment;
  dependencies: DoctorDependencies;
  probeProvider?: boolean;
  probeModelId?: string;
}) => {
  const checks: DoctorCheck[] = [];
  const add = (name: DoctorCheck["name"], status: DoctorCheck["status"], message: string) =>
    checks.push({ name, status, message });
  const missing = requiredEnvironment.filter((key) => !configured(environment[key]));
  const databaseUrlValid = validUrl(environment.DATABASE_URL, ["postgres:", "postgresql:"]);
  const appUrlValid = validUrl(environment.APP_URL, ["http:", "https:"]);
  const invalidUrls = [
    ...(!databaseUrlValid && configured(environment.DATABASE_URL) ? ["DATABASE_URL"] : []),
    ...(!appUrlValid && configured(environment.APP_URL) ? ["APP_URL"] : []),
  ];
  add(
    "environment",
    missing.length || invalidUrls.length ? "fail" : "pass",
    missing.length || invalidUrls.length
      ? `Confira o ambiente. Ausentes: ${missing.join(", ") || "nenhuma"}. URLs inválidas: ${invalidUrls.join(", ") || "nenhuma"}.`
      : "Variáveis obrigatórias configuradas.",
  );

  const provider = configured(environment.AI_GATEWAY_API_KEY)
    ? "gateway"
    : configured(environment.ANTHROPIC_API_KEY)
      ? "anthropic"
      : null;
  add(
    "provider",
    provider ? "pass" : "fail",
    provider === "gateway"
      ? "Vercel AI Gateway selecionado. A chave está presente; o acesso ao modelo ainda não foi verificado."
      : provider === "anthropic"
        ? "Anthropic direto selecionado. A chave está presente; o acesso ao modelo ainda não foi verificado."
        : "Configure AI_GATEWAY_API_KEY ou ANTHROPIC_API_KEY para testar o Bot.",
  );

  if (databaseUrlValid) {
    try {
      const database = await dependencies.inspectDatabase(environment.DATABASE_URL!);
      add("database", "pass", "Conexão e inspeção somente leitura concluídas.");
      if (!dependencies.migrationNames.length) {
        add(
          "migrations",
          "fail",
          "Nenhuma migração local encontrada. Execute o comando na cópia completa do projeto.",
        );
      } else {
        const applied = new Set(database.appliedMigrationNames ?? []);
        const pending = dependencies.migrationNames.filter((name) => !applied.has(name));
        const local = new Set(dependencies.migrationNames);
        const unknown = [...applied].filter((name) => !local.has(name));
        add(
          "migrations",
          pending.length || unknown.length ? "fail" : "pass",
          pending.length || unknown.length
            ? `${pending.length} migração(ões) pendente(s); ${unknown.length} desconhecida(s) nesta branch. Confira DATABASE_URL e a branch; aplique as migrações pendentes com bun run db:migrate.`
            : "Todas as migrações locais estão aplicadas.",
        );
      }
      add(
        "owner",
        database.ownerAvailable ? "pass" : "fail",
        database.ownerAvailable
          ? "Há um responsável vinculado a um Tenant."
          : "Nenhum responsável encontrado. Conclua o convite de um Tenant ou prepare o Tenant de demonstração.",
      );
    } catch {
      add(
        "database",
        "fail",
        "Não foi possível inspecionar o banco. Confira DATABASE_URL, conexão e permissões de leitura.",
      );
      add("migrations", "skip", "Verificação depende do banco acessível.");
      add("owner", "skip", "Verificação depende do banco acessível.");
    }
  } else {
    add("database", "skip", "Configure uma DATABASE_URL válida para inspecionar o banco.");
    add("migrations", "skip", "Verificação depende do banco acessível.");
    add("owner", "skip", "Verificação depende do banco acessível.");
  }

  if (appUrlValid) {
    const running = await dependencies
      .checkServer(new URL(environment.APP_URL!).origin)
      .catch(() => false);
    add(
      "server",
      running ? "pass" : "fail",
      running
        ? "A página de entrada responde."
        : "O servidor não respondeu corretamente. Inicie com bun run dev e confira APP_URL.",
    );
  } else {
    add("server", "skip", "Configure uma APP_URL válida para verificar o servidor.");
  }

  await checkSweepSchedule(environment, dependencies, appUrlValid, add);

  if (
    probeModelId !== undefined &&
    (!probeProvider || !/^[a-z0-9-]+\/[a-z0-9._:-]+$/.test(probeModelId))
  ) {
    add("provider_probe", "fail", "Use --probe-model criador/modelo junto com --probe-provider.");
  } else if (!probeProvider) {
    add(
      "provider_probe",
      "skip",
      "Nenhuma chamada ao modelo. Use --probe-provider para uma chamada sintética que pode gerar custo.",
    );
  } else if (environment.CI) {
    add("provider_probe", "fail", "A chamada ao provedor real é desabilitada em CI.");
  } else if (probeModelId && provider !== "gateway") {
    add(
      "provider_probe",
      "fail",
      "--probe-model exige AI_GATEWAY_API_KEY; nenhuma chamada foi feita.",
    );
  } else if (!provider) {
    add(
      "provider_probe",
      "skip",
      "Configure uma chave de provedor antes de solicitar a chamada sintética.",
    );
  } else {
    try {
      await dependencies.probeProvider(environment, probeModelId);
      add(
        "provider_probe",
        "pass",
        probeModelId
          ? `O modelo alternativo ${probeModelId} respondeu sem dados de contatos. O modelo do Bot não foi verificado.`
          : "O modelo respondeu à chamada sintética sem dados de contatos.",
      );
    } catch (error) {
      const status =
        typeof error === "object" &&
        error !== null &&
        "statusCode" in error &&
        typeof error.statusCode === "number"
          ? error.statusCode
          : null;
      add(
        "provider_probe",
        "fail",
        status === 403
          ? "HTTP 403: o provedor recusou o modelo. Confira permissões e créditos; a chave presente não garante acesso ao modelo."
          : status === 401
            ? "HTTP 401: o provedor recusou a autenticação. Confira a chave selecionada."
            : "A chamada sintética falhou. Confira o acesso ao modelo, os créditos e a conexão com o provedor.",
      );
    }
  }

  return { ok: checks.every(({ status }) => status !== "fail"), checks };
};
