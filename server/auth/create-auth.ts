import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import type { Database } from "@/db/database";
import * as schema from "@/db/schema";

type AuthOptions = {
  db: Database;
  baseURL: string;
  secret: string;
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

export const createAuth = ({ db, baseURL, secret, runInBackground }: AuthOptions) =>
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
