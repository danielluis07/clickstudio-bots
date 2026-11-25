import { AsyncLocalStorage } from "node:async_hooks";
import { getIP } from "@better-auth/core/utils/ip";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import type { Database } from "@/db/database";
import * as schema from "@/db/schema";
import { createSignInThrottle, type SignInThrottle } from "@/modules/identity";
import type { Clock } from "@/platform/clock";

type AuthOptions = {
  db: Database;
  baseURL: string;
  secret: string;
  clock: Clock;
  // Lets Better Auth finish its background work after the response goes out.
  runInBackground?: (promise: Promise<unknown>) => void;
};

// A Tenant is a Better Auth organization with the default roles.
const tenantOrganizations = organization({
  allowUserToCreateOrganization: false,
});

// Invite-only onboarding: nobody signs up on their own. Members reach Tenant
// data only through the Tenant-scoped repository, so the plugin's HTTP routes
// stay off; Members are invited and removed through the tenancy module.
// Self-service password reset is not offered yet, so its routes stay off too.
const disabledAuthPaths = [
  "/sign-up/email",
  "/request-password-reset",
  "/reset-password",
  ...Object.values(tenantOrganizations.endpoints).flatMap((endpoint) =>
    endpoint.path ? [endpoint.path] : [],
  ),
];

const signInEmailPath = "/sign-in/email";

// Code of the APIError a refused sign-in throws, for the form's message.
export const tooManySignInAttemptsCode = "TOO_MANY_SIGN_IN_ATTEMPTS";

// What the sign-in and invitation forms show for that refusal.
export const tooManySignInAttemptsMessage =
  "Muitas tentativas de entrar. Aguarde alguns minutos e tente novamente.";

// Set only by server code, never by a request: an HTTP call to the handler
// cannot reach it.
const alreadyCounted = new AsyncLocalStorage<true>();

// Runs a sign-in whose password check was already counted, as by accepting an
// invitation just before (`acceptInvitation`), so it does not count twice and
// cannot be refused right after the invitation was accepted.
export const signInAlreadyCounted = <T>(signIn: () => Promise<T>) =>
  alreadyCounted.run(true, signIn);

// Better Auth's own rate limiter keeps its counters in memory and runs only
// for requests through `auth.handler`, never for `auth.api` calls from Server
// Actions. This hook runs for both, with counters in Postgres (#77).
const limitSignInAttempts = (throttle: SignInThrottle) =>
  createAuthMiddleware(async (ctx) => {
    if (ctx.path !== signInEmailPath || alreadyCounted.getStore()) return;
    const body: unknown = ctx.body;
    const email =
      body && typeof body === "object" && "email" in body && typeof body.email === "string"
        ? body.email
        : null;
    // Vercel overwrites x-forwarded-for with the one client IP (ADR 0002).
    // Behind a proxy that appends to it instead, getIP returns null and only
    // the per-email limit applies until `trustedProxies` is configured.
    const ip = ctx.headers ? getIP(ctx.headers, ctx.context.options) : null;
    if (!(await throttle.attempt({ ip, email }))) {
      throw new APIError("TOO_MANY_REQUESTS", {
        message: "Too many sign-in attempts",
        code: tooManySignInAttemptsCode,
      });
    }
  });

export const createAuth = ({ db, baseURL, secret, clock, runInBackground }: AuthOptions) =>
  betterAuth({
    baseURL,
    secret,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        ...schema,
      },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
    },
    user: {
      additionalFields: {
        // Platform role, exposed as session.user.role. `input: false` keeps it
        // out of /update-user, so only the admin:create CLI sets "admin".
        role: {
          type: ["admin", "user"],
          required: false,
          defaultValue: "user",
          input: false,
        },
      },
    },
    disabledPaths: disabledAuthPaths,
    hooks: {
      before: limitSignInAttempts(createSignInThrottle({ db, clock })),
    },
    advanced: {
      database: {
        generateId: false,
      },
      // Without a handler emails are awaited, which tests rely on.
      ...(runInBackground && {
        backgroundTasks: { handler: runInBackground },
      }),
    },
    plugins: [tenantOrganizations, nextCookies()],
  });
