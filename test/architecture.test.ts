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

describe("architecture", () => {
  test("modules stay framework-free and receive their dependencies", () => {
    const forbidden = [
      /^next(\/|$)/,
      /^react(-dom)?(\/|$)/,
      /^@\/(app|components|hooks|providers|server)(\/|$)/,
      // The live database pool and environment are wired in by server/.
      /^@\/db$/,
      /^@\/platform\/env$/,
    ];
    expect(
      violations(under("modules"), (specifier) =>
        forbidden.some((pattern) => pattern.test(specifier)),
      ),
    ).toEqual([]);
  });

  test("code outside a module imports only its index", () => {
    expect(
      violations(sourceFiles, (specifier, file) => {
        const target = specifier.match(/^@\/modules\/([^/]+)\/.+/)?.[1];
        return target !== undefined && target !== moduleOf(file);
      }),
    ).toEqual([]);
  });

  test("a module's own files import each other directly, not through its index", () => {
    expect(
      violations(under("modules"), (specifier, file) => specifier === `@/modules/${moduleOf(file)}`),
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
