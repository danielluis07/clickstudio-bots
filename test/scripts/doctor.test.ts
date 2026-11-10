import { expect, test } from "bun:test";
import { applicationRoleTimeouts } from "@/db/application-role";
import {
  runDoctor,
  type DoctorDependencies,
  type DoctorEnvironment,
} from "@/scripts/doctor/checks";

const environment: DoctorEnvironment = {
  DATABASE_URL: "postgres://dev:secret-database@localhost/dev",
  BETTER_AUTH_SECRET: "secret-auth",
  APP_URL: "http://localhost:3000",
  RESEND_API_KEY: "secret-mailer",
  EMAIL_FROM: "test@example.com",
  AI_GATEWAY_API_KEY: "secret-gateway",
  ANTHROPIC_API_KEY: "secret-anthropic",
};

const applicationRole = { timeouts: { ...applicationRoleTimeouts }, canChangeSchema: false };

const ready = (overrides: Partial<DoctorDependencies> = {}): DoctorDependencies => ({
  migrationNames: ["first", "second"],
  inspectDatabase: async () => ({
    appliedMigrationNames: ["first", "second"],
    ownerAvailable: true,
    role: applicationRole,
  }),
  checkServer: async () => true,
  probeProvider: async () => {
    throw new Error("Unexpected live probe");
  },
  ...overrides,
});

test("the default report checks readiness without calling a Model or exposing configuration values", async () => {
  const report = await runDoctor({ environment, dependencies: ready() });
  expect(report.ok).toBe(true);
  expect(report.checks.find(({ name }) => name === "provider")).toMatchObject({
    status: "pass",
    message: expect.stringContaining("Vercel AI Gateway"),
  });
  expect(report.checks.find(({ name }) => name === "provider_probe")).toMatchObject({
    status: "skip",
  });
  const output = JSON.stringify(report);
  for (const value of Object.values(environment)) expect(output).not.toContain(value!);
});

test("the doctor reports missing or malformed environment without attempting dependent connections", async () => {
  const report = await runDoctor({
    environment: { DATABASE_URL: "secret-invalid-database", APP_URL: "secret-invalid-url" },
    dependencies: ready({
      inspectDatabase: async () => {
        throw new Error("Unexpected database connection");
      },
      checkServer: async () => {
        throw new Error("Unexpected server connection");
      },
    }),
  });
  expect(report.ok).toBe(false);
  expect(report.checks.filter(({ status }) => status === "fail").map(({ name }) => name)).toEqual([
    "environment",
    "provider",
  ]);
  expect(report.checks.find(({ name }) => name === "database")?.status).toBe("skip");
  expect(report.checks.find(({ name }) => name === "server")?.status).toBe("skip");
  expect(JSON.stringify(report)).not.toContain("secret-invalid");
});

test("pending migrations and missing owner are reported without applying or creating anything", async () => {
  const report = await runDoctor({
    environment,
    dependencies: ready({
      inspectDatabase: async () => ({
        appliedMigrationNames: ["first"],
        ownerAvailable: false,
        role: applicationRole,
      }),
    }),
  });
  expect(report.ok).toBe(false);
  expect(report.checks.find(({ name }) => name === "migrations")).toMatchObject({
    status: "fail",
    message: expect.stringContaining("1 migração(ões) pendente(s); 0 desconhecida(s)"),
  });
  expect(report.checks.find(({ name }) => name === "owner")?.status).toBe("fail");
});

test("migrations from another branch cannot be mistaken for local readiness", async () => {
  const report = await runDoctor({
    environment,
    dependencies: ready({
      inspectDatabase: async () => ({
        appliedMigrationNames: ["first", "second", "future"],
        ownerAvailable: true,
        role: applicationRole,
      }),
    }),
  });
  expect(report.checks.find(({ name }) => name === "migrations")).toMatchObject({
    status: "fail",
    message: expect.stringContaining("0 migração(ões) pendente(s); 1 desconhecida(s)"),
  });
  expect(report.ok).toBe(false);
});

test("a missing migration history and a stopped server remain visible in the report", async () => {
  const report = await runDoctor({
    environment,
    dependencies: ready({
      inspectDatabase: async () => ({
        appliedMigrationNames: null,
        ownerAvailable: false,
        role: applicationRole,
      }),
      checkServer: async () => false,
    }),
  });
  expect(report.ok).toBe(false);
  expect(report.checks.find(({ name }) => name === "migrations")?.message).toContain(
    "2 migração(ões) pendente(s)",
  );
  expect(report.checks.find(({ name }) => name === "server")?.status).toBe("fail");
});

test("database failures are sanitized and do not prevent the independent server check", async () => {
  const report = await runDoctor({
    environment,
    dependencies: ready({
      inspectDatabase: async () => {
        throw new Error(`Connection failed: ${environment.DATABASE_URL}`);
      },
    }),
  });
  expect(report.ok).toBe(false);
  expect(report.checks.find(({ name }) => name === "database")?.status).toBe("fail");
  expect(report.checks.find(({ name }) => name === "database_role")?.status).toBe("skip");
  expect(report.checks.find(({ name }) => name === "server")?.status).toBe("pass");
  expect(JSON.stringify(report)).not.toContain("secret-database");
});

test("a role without the expected timeouts fails readiness and names the missing settings", async () => {
  const report = await runDoctor({
    environment,
    dependencies: ready({
      inspectDatabase: async () => ({
        appliedMigrationNames: ["first", "second"],
        ownerAvailable: true,
        role: {
          timeouts: { ...applicationRoleTimeouts, lock_timeout: 0, statement_timeout: 60_000 },
          canChangeSchema: false,
        },
      }),
    }),
  });
  expect(report.ok).toBe(false);
  const check = report.checks.find(({ name }) => name === "database_role");
  expect(check?.status).toBe("fail");
  expect(check?.message).toContain("statement_timeout, lock_timeout");
  expect(check?.message).not.toContain("idle_in_transaction_session_timeout");
  expect(check?.message).toContain("bun run db:app-role");
});

test("a role that can change the schema fails readiness even with every timeout", async () => {
  const report = await runDoctor({
    environment,
    dependencies: ready({
      inspectDatabase: async () => ({
        appliedMigrationNames: ["first", "second"],
        ownerAvailable: true,
        role: { ...applicationRole, canChangeSchema: true },
      }),
    }),
  });
  expect(report.ok).toBe(false);
  expect(report.checks.find(({ name }) => name === "database_role")).toMatchObject({
    status: "fail",
    message: expect.stringContaining("criar ou alterar tabelas"),
  });
});

test("server checks receive only the configured origin, without paths, queries or credentials", async () => {
  let checkedOrigin = "";
  await runDoctor({
    environment: { ...environment, APP_URL: "http://name:secret@localhost:3000/path?secret=query" },
    dependencies: ready({
      checkServer: async (origin) => {
        checkedOrigin = origin;
        return true;
      },
    }),
  });
  expect(checkedOrigin).toBe("http://localhost:3000");
});

test("only an explicit probe calls the configured provider, exactly once", async () => {
  let calls = 0;
  const report = await runDoctor({
    environment,
    probeProvider: true,
    dependencies: ready({
      probeProvider: async () => {
        calls += 1;
      },
    }),
  });
  expect(calls).toBe(1);
  expect(report.ok).toBe(true);
  expect(report.checks.find(({ name }) => name === "provider_probe")?.status).toBe("pass");
});

test("a provider HTTP 403 explains model access without leaking the key or error body", async () => {
  const report = await runDoctor({
    environment,
    probeProvider: true,
    dependencies: ready({
      probeProvider: async () => {
        throw Object.assign(new Error(environment.AI_GATEWAY_API_KEY), { statusCode: 403 });
      },
    }),
  });
  expect(report.ok).toBe(false);
  expect(report.checks.find(({ name }) => name === "provider_probe")).toMatchObject({
    status: "fail",
    message: expect.stringContaining("HTTP 403"),
  });
  expect(JSON.stringify(report)).not.toContain("secret-gateway");
});

test("an explicit alternative is passed to the probe and cannot verify the Bot model", async () => {
  const modelId = "google/gemini-2.5-flash-lite";
  const calls: (string | undefined)[] = [];
  const report = await runDoctor({
    environment,
    probeProvider: true,
    probeModelId: modelId,
    dependencies: ready({
      probeProvider: async (_, id) => {
        calls.push(id);
      },
    }),
  });
  expect(calls).toEqual([modelId]);
  expect(report.ok).toBe(true);
  const probe = report.checks.find(({ name }) => name === "provider_probe");
  expect(probe?.status).toBe("pass");
  expect(probe?.message).toContain(`${modelId} respondeu`);
  expect(probe?.message).toContain("O modelo do Bot não foi verificado");
});

test("alternative probes require opt-in, a Gateway key, a model ID and a non-CI environment", async () => {
  let calls = 0;
  const dependencies = ready({
    probeProvider: async () => {
      calls += 1;
    },
  });
  for (const options of [
    { environment, probeProvider: false, probeModelId: "google/gemini-2.5-flash-lite" },
    { environment, probeProvider: true, probeModelId: "" },
    { environment, probeProvider: true, probeModelId: "invalid-model" },
    {
      environment: { ...environment, AI_GATEWAY_API_KEY: "" },
      probeProvider: true,
      probeModelId: "google/gemini-2.5-flash-lite",
    },
    {
      environment: { ...environment, CI: "true" },
      probeProvider: true,
      probeModelId: "google/gemini-2.5-flash-lite",
    },
  ]) {
    const report = await runDoctor({ ...options, dependencies });
    expect(report.ok).toBe(false);
    expect(report.checks.find(({ name }) => name === "provider_probe")?.status).toBe("fail");
  }
  expect(calls).toBe(0);
});

test("CI refuses opt-in live probes and a missing key never triggers a call", async () => {
  let calls = 0;
  const dependencies = ready({
    probeProvider: async () => {
      calls += 1;
    },
  });
  const ci = await runDoctor({
    environment: { ...environment, CI: "true" },
    dependencies,
    probeProvider: true,
  });
  expect(ci.ok).toBe(false);
  expect(ci.checks.find(({ name }) => name === "provider_probe")?.status).toBe("fail");
  const noKey = await runDoctor({
    environment: { ...environment, AI_GATEWAY_API_KEY: "", ANTHROPIC_API_KEY: "" },
    dependencies,
    probeProvider: true,
  });
  expect(noKey.ok).toBe(false);
  expect(noKey.checks.find(({ name }) => name === "provider_probe")?.status).toBe("skip");
  expect(calls).toBe(0);
});

test("direct Anthropic remains identifiable without a Gateway key", async () => {
  const report = await runDoctor({
    environment: { ...environment, AI_GATEWAY_API_KEY: undefined },
    dependencies: ready(),
  });
  expect(report.checks.find(({ name }) => name === "provider")?.message).toContain(
    "Anthropic direto",
  );
});

test("the command emits a parseable JSON report and a failing exit code without valid configuration", async () => {
  const child = Bun.spawn([process.execPath, "scripts/doctor.ts", "--json"], {
    cwd: `${import.meta.dir}/../..`,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      DATABASE_URL: "secret-invalid",
      APP_URL: "secret-invalid",
      AI_GATEWAY_API_KEY: "",
      ANTHROPIC_API_KEY: "",
    },
  });
  const [output, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  expect(exitCode).toBe(1);
  expect(JSON.parse(output)).toMatchObject({ ok: false, checks: expect.any(Array) });
  expect(output).not.toContain("secret-invalid");
});
