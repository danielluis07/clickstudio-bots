import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const [operation, adminEmail, tenantId, format, destination, ...extra] = process.argv.slice(2);
const lifecycleOperation = operation === "cancel" || operation === "reactivate";
const valid =
  adminEmail &&
  tenantId &&
  !extra.length &&
  ((lifecycleOperation && !format && !destination) ||
    (operation === "export" && (format === "json" || format === "csv") && destination));
if (!valid) {
  console.error("Uso: bun run tenant:cancel <admin-email> <tenant-id>");
  console.error("Uso: bun run tenant:reactivate <admin-email> <tenant-id>");
  console.error("Uso: bun run tenant:export <admin-email> <tenant-id> <json|csv> <novo-diretório>");
  process.exit(1);
}

const errorMessages = {
  forbidden: "Informe o e-mail de um administrador da plataforma ativo.",
  not_found: "Negócio não encontrado.",
  busy: "Há uma operação em andamento. Aguarde dois minutos e tente novamente.",
  not_canceled: "Este negócio não está cancelado.",
  recovery_expired: "O prazo de 30 dias para reativação terminou.",
  subscription_failed:
    "A Meta recusou a reconexão. O negócio continua cancelado; verifique a credencial e tente novamente.",
  invalid_format: "Escolha json ou csv para a exportação.",
} as const;

try {
  // Validate usage before opening the real database or loading configuration.
  const [
    { db },
    { createUserRepository },
    { createTenantLifecycle, createTenantExport },
    { systemClock },
    { createWhatsAppGateway },
  ] = await Promise.all([
    import("@/db"),
    import("@/modules/identity"),
    import("@/modules/tenancy"),
    import("@/platform/clock"),
    import("@/server/whatsapp"),
  ]);
  const actor = await createUserRepository(db).findByEmail(adminEmail.trim().toLowerCase());
  if (!actor) {
    console.error(errorMessages.forbidden);
    process.exit(1);
  }
  const dependencies = { db, clock: systemClock, getWhatsApp: createWhatsAppGateway };
  if (lifecycleOperation) {
    const result = await createTenantLifecycle(dependencies)[operation](actor.id, tenantId);
    if (!result.ok) {
      console.error(errorMessages[result.error]);
      process.exit(1);
    }
    if ("channelDisconnected" in result && !result.channelDisconnected) {
      console.error(
        "Cancelamento registrado e Bot interrompido. A desconexão na Meta falhou; repita o comando ou aguarde a tarefa diária.",
      );
      process.exit(2);
    }
    console.log(
      operation === "cancel"
        ? "Cancelamento registrado. Os dados serão excluídos após 30 dias."
        : "Negócio reativado com os dados e as configurações preservados.",
    );
  } else {
    const result = await createTenantExport(dependencies).export(
      actor.id,
      tenantId,
      format as "json" | "csv",
    );
    if (!result.ok) {
      console.error(errorMessages[result.error]);
      process.exit(1);
    }
    const outputDirectory = resolve(destination!);
    await mkdir(dirname(outputDirectory), { recursive: true, mode: 0o700 });
    // Refuse an existing destination; an operator must never overwrite a
    // previous delivery or mix two Tenants' exports in the same directory.
    await mkdir(outputDirectory, { mode: 0o700 });
    for (const file of result.files) {
      await writeFile(resolve(outputDirectory, file.filename), file.content, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
    }
    console.log(
      `Exportação concluída: ${result.files.length} arquivo(s). Entregue ao responsável em até 15 dias da solicitação.`,
    );
  }
  process.exit(0);
} catch {
  // Database errors may contain Contact data or credentials. Never print them.
  console.error(
    "Não foi possível concluir a operação. Verifique a configuração e, na exportação, use um diretório novo com permissão de escrita.",
  );
  process.exit(1);
}
