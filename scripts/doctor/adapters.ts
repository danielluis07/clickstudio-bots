import { readMigrationFiles } from "drizzle-orm/migrator";
import { Client } from "pg";
import { createGateway } from "ai";
import { createAiSdkModel, createBotModel } from "@/platform/ai-sdk-model";
import { readSweepSchedule } from "@/platform/qstash";
import {
  defaultQStashUrl,
  type DatabaseReadiness,
  type DoctorDependencies,
} from "@/scripts/doctor/checks";

type DatabaseQuery = (statement: string) => Promise<Record<string, unknown>[]>;

// Transaction-local read-only mode also works on Neon's pooled endpoint. Keep
// this transaction limited to database reads; no HTTP or Model calls run here.
export const inspectDatabaseReadiness = async (
  query: DatabaseQuery,
): Promise<DatabaseReadiness> => {
  await query("BEGIN READ ONLY");
  try {
    const [tables] = await query(`select
      exists(select 1 from information_schema.columns
        where table_schema = 'drizzle' and table_name = '__drizzle_migrations'
        and column_name = 'name') as has_migrations,
      to_regclass('public.member') is not null as has_members`);
    const applied = tables.has_migrations
      ? await query("select name from drizzle.__drizzle_migrations")
      : null;
    const owner = tables.has_members
      ? await query("select exists(select 1 from public.member where role = 'owner') as available")
      : [];
    await query("COMMIT");
    return {
      appliedMigrationNames:
        applied?.flatMap(({ name }) => (typeof name === "string" ? [name] : [])) ?? null,
      ownerAvailable: owner[0]?.available === true,
    };
  } catch (error) {
    await query("ROLLBACK");
    throw error;
  }
};

export const createDoctorDependencies = (): DoctorDependencies => ({
  migrationNames: readMigrationFiles({ migrationsFolder: `${import.meta.dir}/../../drizzle` }).map(
    ({ name }) => name,
  ),
  async inspectDatabase(connectionString) {
    const client = new Client({
      connectionString,
      connectionTimeoutMillis: 5_000,
      query_timeout: 5_000,
    });
    try {
      await client.connect();
      return await inspectDatabaseReadiness(
        async (statement) => (await client.query(statement)).rows,
      );
    } finally {
      await client.end();
    }
  },
  async checkServer(origin) {
    const response = await fetch(new URL("/entrar", origin), {
      signal: AbortSignal.timeout(3_000),
      redirect: "manual",
    });
    await response.body?.cancel();
    return response.status === 200;
  },
  readSweepSchedule: (environment) =>
    readSweepSchedule({
      token: environment.QSTASH_TOKEN!,
      baseUrl: environment.QSTASH_URL?.trim() || defaultQStashUrl,
    }),
  async probeProvider(environment, modelId) {
    // An explicit diagnostic override uses Gateway routing, never the direct key.
    // Production keeps its own model and restricted provider selection.
    const model = modelId
      ? createAiSdkModel({
          model: createGateway({ apiKey: environment.AI_GATEWAY_API_KEY })(modelId),
          maxOutputTokens: 32,
        })
      : createBotModel({
          gatewayApiKey: environment.AI_GATEWAY_API_KEY,
          anthropicApiKey: environment.ANTHROPIC_API_KEY,
          modelId: environment.AI_MODEL_ID,
        });
    if (!model) throw new Error("Provider not configured");
    const result = await model.generate({
      tools: [],
      instructions: "This is a synthetic connectivity check. Reply with exactly OK.",
      knowledgeBase: "Synthetic test only. No Contact data.",
      contact: "",
      messages: [{ role: "user", text: "Responda apenas OK." }],
    });
    if (!result.text.trim() || result.toolCalls.length)
      throw new Error("Unexpected provider response");
  },
});
