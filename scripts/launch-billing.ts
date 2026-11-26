// Usage: bun run billing:launch <admin-email>, with the target environment's
// DATABASE_URL and BILLING_ENABLED=true (docs/billing.md). Gives every Tenant
// without a Trial end 30 days from now (ADR 0012). Safe to run again: Tenants
// that already have a Trial end keep it.
export {};
const [adminEmail, ...extra] = process.argv.slice(2);
if (!adminEmail || extra.length) {
  console.error("Uso: bun run billing:launch <admin-email>");
  process.exit(1);
}

try {
  // Validate usage before opening the real database or loading configuration.
  const [
    { db },
    { createUserRepository, isPlatformAdmin },
    { createBilling, trialDays },
    clock,
    { env },
  ] = await Promise.all([
    import("@/db"),
    import("@/modules/identity"),
    import("@/modules/billing"),
    import("@/platform/clock"),
    import("@/platform/env"),
  ]);
  const actor = await createUserRepository(db).findByEmail(adminEmail.trim().toLowerCase());
  if (!actor || !(await isPlatformAdmin(db, actor.id))) {
    console.error("Informe o e-mail de um administrador da plataforma ativo.");
    process.exit(1);
  }
  const result = await createBilling({
    db,
    clock: clock.systemClock,
    enabled: env.BILLING_ENABLED,
  }).launch();
  if (!result.ok) {
    console.error(
      "A cobrança está desligada neste ambiente. Defina BILLING_ENABLED=true antes de iniciar os períodos de teste.",
    );
    process.exit(1);
  }
  console.log(
    result.started
      ? `Período de teste de ${trialDays} dias iniciado para ${result.started} negócio(s).`
      : "Todos os negócios já têm um período de teste. Nada mudou.",
  );
  process.exit(0);
} catch {
  // Database errors may carry Tenant data. Never print them.
  console.error("Não foi possível concluir a operação. Verifique a configuração.");
  process.exit(1);
}
