import { parseArgs } from "node:util";
import { Client } from "pg";
import { AppRoleSetupError, configureAppRole } from "@/scripts/database-role/configure";

const main = async () => {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    strict: true,
    options: { help: { type: "boolean" }, role: { type: "string" } },
  });
  if (values.help || !values.role) {
    console.log("Uso: bun run db:roles --role <nome>");
    console.log(
      "Cria ou atualiza o papel da aplicação: leitura e escrita de dados, sem alterar o esquema, com limites de tempo.",
    );
    console.log(
      "Conecta com DATABASE_MIGRATION_URL (papel dono do esquema, endereço direto). Um papel novo usa APP_DATABASE_PASSWORD.",
    );
    if (!values.help) process.exitCode = 1;
    return;
  }
  const connectionString = process.env.DATABASE_MIGRATION_URL;
  if (!connectionString) {
    console.error(
      "Configure DATABASE_MIGRATION_URL com a conexão direta do papel dono do esquema.",
    );
    process.exitCode = 1;
    return;
  }
  // A one-off admin command: it can wait longer than a request for a cold branch.
  const client = new Client({ connectionString, connectionTimeoutMillis: 10_000 });
  await client.connect();
  try {
    await configureAppRole(async (statement) => (await client.query(statement)).rows, {
      role: values.role,
      password: process.env.APP_DATABASE_PASSWORD,
    });
  } finally {
    await client.end();
  }
  console.log(
    `Papel ${values.role} configurado. Use-o na DATABASE_URL (endereço com pooling) da aplicação.`,
  );
};

// Errors can carry connection strings or passwords; print only a diagnosis.
if (import.meta.main)
  await main().catch((error: unknown) => {
    const refusals = {
      invalid_role_name: "Nome de papel inválido: use letras minúsculas, números e _.",
      password_required:
        "Papel novo: defina APP_DATABASE_PASSWORD com pelo menos 16 caracteres ASCII, sem espaços.",
      role_can_change_schema:
        "Esse papel é o dono do esquema, pertence a ele ou é superusuário. Escolha outro nome para o papel da aplicação.",
    };
    console.error(
      error instanceof AppRoleSetupError
        ? refusals[error.reason]
        : "Não foi possível configurar o papel. Confira se DATABASE_MIGRATION_URL usa o papel dono do esquema.",
    );
    process.exitCode = 1;
  });
