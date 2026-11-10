import { Client } from "pg";
import { configureApplicationRole } from "@/db/application-role";

// Creates or updates the role in DATABASE_URL through the owner's connection
// in DATABASE_OWNER_URL. Run it after `bun run db:migrate`, once per branch.
const main = async () => {
  const ownerUrl = process.env.DATABASE_OWNER_URL;
  const appUrl = URL.parse(process.env.DATABASE_URL ?? "");
  const role = decodeURIComponent(appUrl?.username ?? "");
  const password = decodeURIComponent(appUrl?.password ?? "");
  if (!ownerUrl || !role || !password) {
    console.error(
      "Defina DATABASE_OWNER_URL (papel dono, conexão direta) e DATABASE_URL (papel do aplicativo, com usuário e senha).",
    );
    process.exitCode = 1;
    return;
  }
  const client = new Client({ connectionString: ownerUrl, connectionTimeoutMillis: 10_000 });
  await client.connect();
  try {
    const result = await configureApplicationRole(
      async (statement, params) => (await client.query(statement, params)).rows,
      { role, password },
    );
    console.log(
      `Papel ${role} ${result.created ? "criado" : "atualizado"}: leitura e escrita de linhas, sem alterar o esquema, com limites de tempo.`,
    );
    if (!result.migrationHistory)
      console.log(
        "Histórico de migrações ausente. Rode bun run db:migrate e depois este comando de novo.",
      );
  } finally {
    await client.end();
  }
};

if (import.meta.main)
  await main().catch(() => {
    // Raw errors may echo a connection string or the password.
    console.error(
      "Não foi possível configurar o papel do aplicativo. Confira as duas URLs e se DATABASE_URL não usa o papel dono.",
    );
    process.exitCode = 1;
  });
