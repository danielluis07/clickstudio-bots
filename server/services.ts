import { db } from "@/db";
import { systemClock } from "@/platform/clock";
import { env } from "@/platform/env";
import { createTenantOnboarding } from "@/modules/tenancy";
import { createResendMailer } from "@/platform/resend-mailer";

export const tenantOnboarding = createTenantOnboarding({
  db,
  mailer: createResendMailer({
    apiKey: env.RESEND_API_KEY,
    from: env.EMAIL_FROM,
  }),
  clock: systemClock,
  appUrl: env.APP_URL,
});
