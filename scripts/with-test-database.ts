// Usage: bun scripts/with-test-database.ts <command...>
// Runs the command with DATABASE_URL pointing at DATABASE_URL_TEST, the
// disposable Neon test branch, so migrations, seed data and a local dev
// server never touch the main database. Bun, Next.js and drizzle-kit load
// `.env` without overriding variables already set, so the override wins.
const testUrl = process.env.DATABASE_URL_TEST;
const command = process.argv.slice(2);

if (!testUrl || testUrl === process.env.DATABASE_URL) {
  console.error("Set DATABASE_URL_TEST in .env to a Neon test branch, different from DATABASE_URL.");
  process.exit(1);
}
if (command.length === 0) {
  console.error("Usage: bun scripts/with-test-database.ts <command...>");
  process.exit(1);
}

const child = Bun.spawn(command[0] === "bun" ? [process.execPath, ...command.slice(1)] : command, {
  env: { ...process.env, DATABASE_URL: testUrl },
  stdio: ["inherit", "inherit", "inherit"],
});
process.exit(await child.exited);

export {};
