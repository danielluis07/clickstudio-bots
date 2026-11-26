import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

test("importing a file passes its name and bytes to the Knowledge base and explains every refusal in pt-BR", async () => {
  const process = Bun.spawn(
    [
      Bun.which("bun")!,
      fileURLToPath(new URL("../support/import-knowledge-file-action.ts", import.meta.url)),
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(stdout).toContain("import success passed");
  expect(stdout).toContain("7 import refusal messages passed");
  expect(stdout).toContain("missing file passed");
});
