// This explicit command must never report a skipped real-Postgres suite as green.
export {};
if (!process.env.BOT_TEST_DATABASE_URL) {
  console.error("Set BOT_TEST_DATABASE_URL to a dedicated real Postgres test database.");
  process.exit(1);
}
// Runs every *.postgres.test.ts: competing Bot turns and the application role.
const test = Bun.spawn([process.execPath, "test", ".postgres.test.ts", "--timeout", "30000"], {
  stdout: "inherit",
  stderr: "inherit",
  env: process.env,
});
process.exit(await test.exited);
