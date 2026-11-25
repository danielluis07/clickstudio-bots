import { expect, test } from "bun:test";

// Loads platform/env.ts in a fresh process, with only the required variables.
const loadEnvironment = async (betterAuthSecret: string) => {
  const child = Bun.spawn(
    [Bun.which("bun")!, "--no-env-file", "-e", 'await import("@/platform/env")'],
    {
      cwd: `${import.meta.dir}/../..`,
      env: {
        PATH: process.env.PATH,
        DATABASE_URL: "postgres://test@localhost/test",
        BETTER_AUTH_SECRET: betterAuthSecret,
        APP_URL: "http://localhost:3000",
        RESEND_API_KEY: "test-resend-key",
        EMAIL_FROM: "test@example.com",
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stderr, exitCode] = await Promise.all([new Response(child.stderr).text(), child.exited]);
  return { exitCode, stderr };
};

test("the app refuses to start with a BETTER_AUTH_SECRET shorter than 32 characters", async () => {
  const short = await loadEnvironment("a".repeat(31));
  const long = await loadEnvironment("a".repeat(32));

  expect(short.exitCode).not.toBe(0);
  expect(short.stderr).toContain("BETTER_AUTH_SECRET");
  expect(long).toEqual({ exitCode: 0, stderr: "" });
});
