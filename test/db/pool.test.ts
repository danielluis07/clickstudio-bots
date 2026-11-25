import { afterEach, expect, test } from "bun:test";
import { createServer, type Server, type Socket } from "node:net";
import type { Diagnostic } from "@/platform/diagnostics";
import { createDatabasePool } from "@/db/pool";

let server: Server | undefined;
const sockets: Socket[] = [];
afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.destroy();
  await new Promise((resolve) => server?.close(resolve) ?? resolve(undefined));
});

// A server that accepts the TCP connection and never answers stands in for a
// database (or PgBouncer) that cannot hand out a connection.
test("a request that cannot get a connection fails within the pool's connection timeout", async () => {
  server = createServer((socket) => sockets.push(socket));
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  const pool = createDatabasePool(`postgres://app:secret@127.0.0.1:${port}/app`);
  const started = performance.now();
  try {
    await expect(pool.query("select 1")).rejects.toThrow(/timeout/i);
  } finally {
    await pool.end();
  }
  const elapsed = performance.now() - started;
  expect(elapsed).toBeGreaterThan(4_000);
  expect(elapsed).toBeLessThan(6_500);
}, 10_000);

// Neon closes connections when its compute scales to zero or restarts. pg
// reports a lost idle connection as a pool "error" event, which would crash
// the instance without a listener.
test("a lost idle connection is logged and dropped without crashing the instance", async () => {
  const logged: Diagnostic[] = [];
  const pool = createDatabasePool("postgres://app:secret@127.0.0.1:1/app", (entry) =>
    logged.push(entry),
  );
  const lost = Object.assign(new Error("terminating connection due to administrator command"), {
    severity: "FATAL",
    code: "57P01",
  });
  expect(() => pool.emit("error", lost)).not.toThrow();
  expect(logged).toEqual([
    expect.objectContaining({ kind: "database_connection_lost", sqlState: "57P01" }),
  ]);
  expect(JSON.stringify(logged)).not.toContain("secret");
  await pool.end();
});
