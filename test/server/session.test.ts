import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

test("sign-in goes directly to the correct sidebar and preserves safe return paths", async () => {
  const process = Bun.spawn([Bun.which("bun")!, fileURLToPath(new URL("../support/sign-in-action.ts", import.meta.url))], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(stdout).toContain("9 sign-in destinations passed");
});
