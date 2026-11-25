import { afterEach, expect, test } from "bun:test";
import { createServer, type Server, type Socket } from "node:net";
import { Pool } from "pg";
import { databasePoolOptions } from "@/db/pool-options";

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
  const pool = new Pool(databasePoolOptions(`postgres://app:secret@127.0.0.1:${port}/app`));
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
