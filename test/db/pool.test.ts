import { afterAll, expect, test } from "bun:test";
import { createDatabasePool, poolConnectionTimeoutMs } from "@/db/pool";

// Accepts TCP connections and never answers the Postgres startup message:
// the shape of a database that is down or a pool that cannot hand out a client.
const silent = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
afterAll(() => silent.stop(true));

test("a request that cannot get a connection fails within the pool timeout", async () => {
  const pool = createDatabasePool(`postgres://app:secret@127.0.0.1:${silent.port}/app`);
  const started = performance.now();
  const outcome = await pool.query("select 1").then(
    () => "connected",
    () => "failed",
  );
  const elapsed = performance.now() - started;
  await pool.end();
  expect(outcome).toBe("failed");
  expect(elapsed).toBeGreaterThanOrEqual(poolConnectionTimeoutMs - 100);
  expect(elapsed).toBeLessThan(poolConnectionTimeoutMs + 2_000);
});
