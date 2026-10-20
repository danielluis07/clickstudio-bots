import { describe, expect, test } from "bun:test";
import { safeReturnPath } from "@/server/auth/redirects";

describe("return path after signing in", () => {
  test("keeps a path inside the app, with its query", () => {
    expect(safeReturnPath("/admin")).toBe("/admin");
    expect(safeReturnPath("/painel/conversas?filtro=aguardando")).toBe(
      "/painel/conversas?filtro=aguardando",
    );
  });

  test("falls back to the dashboard for anything that could leave the app", () => {
    for (const value of [
      null,
      "",
      "https://evil.example/painel",
      "//evil.example/painel",
      "/\\evil.example",
      "javascript:alert(1)",
      "painel",
    ]) {
      expect(safeReturnPath(value)).toBe("/painel");
    }
  });
});
