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
};

// A Tenant is a Better Auth organization with the default roles.
const tenantOrganizations = organization({
  allowUserToCreateOrganization: false,
});

// Invite-only onboarding: nobody signs up on their own. Members reach Tenant
// data only through the Tenant-scoped repository, so the plugin's HTTP routes
// stay off; #41 can enable the ones it needs deliberately.
const disabledAuthPaths = [
  "/sign-up/email",
  ...Object.values(tenantOrganizations.endpoints).flatMap((endpoint) =>
    endpoint.path ? [endpoint.path] : [],
  ),
];

export const createAuth = ({ db, baseURL, secret }: AuthOptions) =>
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
    },
    plugins: [tenantOrganizations, nextCookies()],
  });
