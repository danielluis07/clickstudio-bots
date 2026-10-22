import { parseArgs } from "node:util";
import { createDoctorDependencies } from "@/scripts/doctor/adapters";
import { runDoctor } from "@/scripts/doctor/checks";

const main = async () => {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    strict: true,
    options: {
      help: { type: "boolean" },
      json: { type: "boolean" },
      "probe-provider": { type: "boolean" },
    },
  });
  if (values.help) {
    console.log("Uso: bun run doctor [--json] [--probe-provider]");
    console.log("Inspeção somente leitura do ambiente, banco, migrações, responsável e servidor.");
    console.log(
      "--probe-provider faz uma chamada sintética ao modelo que pode gerar custo; desabilitado em CI.",
    );
    return;
  }
  const report = await runDoctor({
    environment: process.env,
    dependencies: createDoctorDependencies(),
    probeProvider: values["probe-provider"],
  });
  if (values.json) console.log(JSON.stringify(report, null, 2));
  else {
    const labels = { pass: "OK", fail: "FALHA", skip: "IGNORADO" };
    for (const check of report.checks)
      console.log(`[${labels[check.status]}] ${check.name}: ${check.message}`);
  }
  if (!report.ok) process.exitCode = 1;
};

if (import.meta.main)
  await main().catch(() => {
    console.error(
      "Não foi possível concluir o diagnóstico. Use --help e confira os arquivos locais de migração.",
    );
    process.exitCode = 1;
  });
