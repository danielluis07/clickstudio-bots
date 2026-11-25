import { AsyncLocalStorage } from "node:async_hooks";
import { getIP } from "@better-auth/core/utils/ip";
import type { BetterAuthOptions } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import type { SignInThrottle } from "@/modules/identity";

// How sign-in attempts are limited (#77): the hook createAuth installs, how a
// refusal is shown, and the one sign-in that skips the count.

const signInEmailPath = "/sign-in/email";

// Code of the APIError a refused sign-in throws, for the form's message.
export const tooManySignInAttemptsCode = "TOO_MANY_SIGN_IN_ATTEMPTS";

// What the sign-in and invitation forms show for that refusal.
export const tooManySignInAttemptsMessage =
  "Muitas tentativas de entrar. Aguarde alguns minutos e tente novamente.";

// The client IP a request's attempts count against, or null when the request
// carries no trustworthy one. Vercel overwrites x-forwarded-for with the one
// client IP (ADR 0002). Behind a proxy that appends to it instead, this
// returns null and only the per-email limit applies until Better Auth's
// `advanced.ipAddress.trustedProxies` is configured.
export const signInClientIp = (headers: Headers, options: BetterAuthOptions) =>
  getIP(headers, options);

// Set only by server code, never by a request: an HTTP call to the handler
// cannot reach it.
const alreadyCounted = new AsyncLocalStorage<true>();

// Runs a sign-in whose password check was already counted, as by accepting an
// invitation just before (`acceptInvitation`), so it does not count twice and
// cannot be refused right after the invitation was accepted. Use it for
// nothing else.
export const signInAlreadyCounted = <T>(signIn: () => Promise<T>) =>
  alreadyCounted.run(true, signIn);

// Better Auth's own rate limiter keeps its counters in memory and runs only
// for requests through `auth.handler`, never for `auth.api` calls from Server
// Actions. This hook runs for both, with counters in Postgres.
export const limitSignInAttempts = (throttle: SignInThrottle) =>
  createAuthMiddleware(async (ctx) => {
    if (ctx.path !== signInEmailPath || alreadyCounted.getStore()) return;
    const body: unknown = ctx.body;
    const email =
      body && typeof body === "object" && "email" in body && typeof body.email === "string"
        ? body.email
        : null;
    const ip = ctx.headers ? signInClientIp(ctx.headers, ctx.context.options) : null;
    if (!(await throttle.attempt({ ip, email }))) {
      throw new APIError("TOO_MANY_REQUESTS", {
        message: "Too many sign-in attempts",
        code: tooManySignInAttemptsCode,
      });
    }
  });
