import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

const request = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost:3000${path}`, {
    headers: cookie ? { cookie } : {},
  });

describe("proxy", () => {
  test("sends a visitor without a session cookie to sign in, remembering where they were going", () => {
    const response = proxy(request("/painel/conversas?filtro=aguardando"));

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/entrar");
    expect(location.searchParams.get("voltar")).toBe(
      "/painel/conversas?filtro=aguardando",
    );
  });

  test("lets a request with a session cookie through to the page's own guard", () => {
    const response = proxy(
      request("/admin", "better-auth.session_token=opaque-token"),
    );

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
