import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// Enforces the dependency rules in ADR 0005. Each rule lists the offending
// "file -> import" pairs so a failure says exactly what to change.

const sourceFiles = [
  ...new Bun.Glob("{app,components,db,hooks,lib,modules,platform,providers,scripts,server,test}/**/*.{ts,tsx}").scanSync(),
  ...new Bun.Glob("*.ts").scanSync(),
].map((path) => path.replaceAll("\\", "/"));

const importPattern = /(?:import|export)[^"']*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;

const importsOf = (path: string) =>
  [...readFileSync(path, "utf8").matchAll(importPattern)].map(
    (match) => match[1] ?? match[2],
  );

const violations = (
  files: string[],
  isForbidden: (specifier: string, file: string) => boolean,
) =>
  files.flatMap((file) =>
    importsOf(file)
      .filter((specifier) => isForbidden(specifier, file))
      .map((specifier) => `${file} -> ${specifier}`),
  );

const under = (folder: string) =>
  sourceFiles.filter((path) => path.startsWith(`${folder}/`));

const moduleOf = (path: string) => path.match(/^modules\/([^/]+)\//)?.[1];
const isModuleHook = (path: string) => /^modules\/[^/]+\/hooks\//.test(path);

describe("architecture", () => {
  test("components contain only TSX files", () => {
    expect(
      [...new Bun.Glob("components/**/*").scanSync({ onlyFiles: true })]
        .filter((path) => !path.endsWith(".tsx")),
    ).toEqual([]);
  });

  test("module domain code stays framework-free and receives its dependencies", () => {
    const forbidden = [
      /^next(\/|$)/,
      /^react(-dom)?(\/|$)/,
      /^@\/(app|components|hooks|providers|server)(\/|$)/,
      // The live database pool and environment are wired in by server/.
      /^@\/db$/,
      /^@\/platform\/env$/,
      /^@\/modules\/[^/]+\/hooks(\/|$)/,
    ];
    expect(
      violations(under("modules").filter((file) => !isModuleHook(file)), (specifier) =>
        forbidden.some((pattern) => pattern.test(specifier)),
      ),
    ).toEqual([]);
  });

  test("module hooks stay browser-safe and receive server operations as dependencies", () => {
    expect(
      violations(under("modules").filter(isModuleHook), (specifier) =>
        /^next(\/|$)/.test(specifier) ||
        /^@\/(app|components|server|db)(\/|$)/.test(specifier) ||
        specifier === "@/platform/env",
      ),
    ).toEqual([]);
  });

  test("code outside a module imports only its domain or hooks index", () => {
    expect(
      violations(sourceFiles, (specifier, file) => {
        const target = specifier.match(/^@\/modules\/([^/]+)\/(.+)/);
        return target !== null && target[1] !== moduleOf(file) && target[2] !== "hooks";
      }),
    ).toEqual([]);
  });

  test("a module's own files import each other directly, not through its index", () => {
    expect(
      violations(under("modules"), (specifier, file) =>
        specifier === `@/modules/${moduleOf(file)}` ||
        (isModuleHook(file) && specifier === `@/modules/${moduleOf(file)}/hooks`),
      ),
    ).toEqual([]);
  });

  test("platform and db never depend on modules or the Next.js layer", () => {
    expect(
      violations([...under("platform"), ...under("db")], (specifier) =>
        /^@\/(modules|server|app|components)(\/|$)/.test(specifier),
      ),
    ).toEqual([]);
  });
});
