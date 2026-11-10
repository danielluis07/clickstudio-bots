import { expect, test } from "bun:test";
import type { Diagnostic } from "@/platform/diagnostics";
import { createQStashJobVerifier } from "@/platform/qstash";
import { createSweepRoute } from "@/server/sweep";
import { qstashSigningKeys, signQStashRequest } from "@/test/support/qstash";

const url = "https://bots.example.com/api/jobs/sweep";
const verifier = createQStashJobVerifier(qstashSigningKeys);

const post = (route: ReturnType<typeof createSweepRoute>, signature?: string, body = "") =>
  route.POST(
    new Request(url, {
      method: "POST",
      body,
      headers: signature ? { "upstash-signature": signature } : {},
    }),
  );

test("the sweep refuses unauthenticated calls without running a task", async () => {
  let runs = 0;
  const tasks = [{ name: "count", run: async () => runs++ }];
  const route = createSweepRoute({ config: { verifier, url }, tasks });

  expect((await post(route)).status).toBe(401);
  expect((await post(route, "not-a-token")).status).toBe(401);
  const otherEndpoint = signQStashRequest({
    url: "https://bots.example.com/api/jobs/run-bot-turn",
    body: "",
  });
  expect((await post(route, otherEndpoint)).status).toBe(401);
  const wrongKey = signQStashRequest({ url, body: "", key: "sig_attacker" });
  expect((await post(route, wrongKey)).status).toBe(401);
  // Unconfigured, it refuses even a valid signature.
  const unconfigured = createSweepRoute({ config: null, tasks });
  expect((await post(unconfigured, signQStashRequest({ url, body: "" }))).status).toBe(503);
  expect(runs).toBe(0);
});

test("a signed sweep runs every task, and one failure does not stop the others", async () => {
  const ran: string[] = [];
  const logged: Diagnostic[] = [];
  const route = createSweepRoute({
    config: { verifier, url },
    diagnostics: { log: (entry) => logged.push(entry) },
    tasks: [
      {
        name: "first",
        run: async () => {
          ran.push("first");
          throw new TypeError("Private 5511988887777");
        },
      },
      { name: "second", run: async () => ran.push("second") },
    ],
  });
  const response = await post(route, signQStashRequest({ url, body: "" }));
  expect(response.status).toBe(500);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({
    ok: false,
    tasks: [
      { name: "first", ok: false },
      { name: "second", ok: true },
    ],
  });
  expect(ran).toEqual(["first", "second"]);
  expect(logged).toEqual([{ kind: "sweep_task_failed", errorClass: "TypeError" }]);
});

test("a sweep whose tasks all succeed answers 200", async () => {
  const route = createSweepRoute({
    config: { verifier, url },
    tasks: [{ name: "only", run: async () => {} }],
  });
  const response = await post(route, signQStashRequest({ url, body: "" }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, tasks: [{ name: "only", ok: true }] });
});
