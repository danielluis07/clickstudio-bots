import { db } from "@/db";
import { systemClock } from "@/lib/clock";
import { env } from "@/lib/env";
import { createTenantOnboarding } from "@/lib/onboarding/tenant-onboarding";
import { createResendMailer } from "@/lib/resend-mailer";

export const tenantOnboarding = createTenantOnboarding({
  db,
  mailer: createResendMailer({
    apiKey: env.RESEND_API_KEY,
    from: env.EMAIL_FROM,
  }),
  clock: systemClock,
  appUrl: env.APP_URL,
});
