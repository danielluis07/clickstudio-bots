import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import type { Database } from "@/db/database";
import * as schema from "@/db/schema";
import {
  passwordResetEmail,
  passwordResetLifetimeMinutes,
} from "@/modules/identity";
import type { Mailer } from "@/platform/mailer";

type AuthOptions = {
  db: Database;
  baseURL: string;
  secret: string;
  mailer: Mailer;
  // Lets the response go out before an email is sent, so its timing does not
  // reveal whether an address has an account.
  runInBackground?: (promise: Promise<unknown>) => void;
};

// A Tenant is a Better Auth organization with the default roles.
const tenantOrganizations = organization({
  allowUserToCreateOrganization: false,
});

// Invite-only onboarding: nobody signs up on their own. Members reach Tenant
// data only through the Tenant-scoped repository, so the plugin's HTTP routes
// stay off; Members are invited and removed through the tenancy module.
const disabledAuthPaths = [
  "/sign-up/email",
  ...Object.values(tenantOrganizations.endpoints).flatMap((endpoint) =>
    endpoint.path ? [endpoint.path] : [],
  ),
];

export const createAuth = ({
  db,
  baseURL,
  secret,
  mailer,
  runInBackground,
}: AuthOptions) =>
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
      resetPasswordTokenExpiresIn: passwordResetLifetimeMinutes * 60,
      revokeSessionsOnPasswordReset: true,
      // The link opens our pt-BR page, which posts the token back, rather
      // than Better Auth's redirecting callback route. Better Auth logs a
      // failed send instead of failing the request, which would reveal
      // which addresses have an account.
      sendResetPassword: ({ user, token }) =>
        mailer.send(
          passwordResetEmail({
            to: user.email,
            name: user.name,
            appUrl: baseURL,
            token,
          }),
        ),
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
