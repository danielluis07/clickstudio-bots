import { describe, expect, test } from "bun:test";
import nextConfig from "@/next.config";
import { contentSecurityPolicy } from "@/server/security-headers";

const directives = (policy: string) =>
  new Map(
    policy.split("; ").map((directive) => {
      const [name, ...sources] = directive.split(" ");
      return [name!, sources];
    }),
  );

describe("security headers", () => {
  test("every route responds with the policy, framing ban, referrer policy and nosniff", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];

    expect(rules.map((rule) => rule.source)).toEqual(["/:path*"]);
    expect(Object.fromEntries(rules[0]!.headers.map(({ key, value }) => [key, value]))).toEqual({
      "Content-Security-Policy": contentSecurityPolicy({ development: false }),
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Content-Type-Options": "nosniff",
    });
  });

  test("no other origin can frame the dashboard", () => {
    expect(
      directives(contentSecurityPolicy({ development: false })).get("frame-ancestors"),
    ).toEqual(["'none'"]);
  });

  test("Meta's SDK for Embedded Signup and Ably's realtime connection are allowed", () => {
    const policy = directives(contentSecurityPolicy({ development: false }));

    expect(policy.get("script-src")).toContain("https://connect.facebook.net");
    expect(policy.get("frame-src")).toContain("https://*.facebook.com");
    expect(policy.get("connect-src")).toEqual(
      expect.arrayContaining([
        "'self'",
        "https://*.facebook.com",
        "wss://*.ably.io",
        "https://*.ably.io",
        "wss://*.ably.net",
        "https://*.ably.net",
        "wss://*.ably-realtime.com",
        "https://*.ably-realtime.com",
      ]),
    );
  });

  test("eval is allowed only in development, where React uses it for error stacks", () => {
    expect(
      directives(contentSecurityPolicy({ development: false })).get("script-src"),
    ).not.toContain("'unsafe-eval'");
    expect(directives(contentSecurityPolicy({ development: true })).get("script-src")).toContain(
      "'unsafe-eval'",
    );
  });
});
