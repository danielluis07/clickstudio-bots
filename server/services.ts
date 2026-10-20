import { db } from "@/db";
import { systemClock } from "@/platform/clock";
import { env } from "@/platform/env";
import { createMemberManagement, createTenantOnboarding } from "@/modules/tenancy";
import { createResendMailer } from "@/platform/resend-mailer";
import { createChannelService } from "@/modules/channels";
import { createWhatsAppGateway } from "@/server/whatsapp";

export const mailer = createResendMailer({
  apiKey: env.RESEND_API_KEY,
  from: env.EMAIL_FROM,
});

const dependencies = {
  db,
  mailer,
  clock: systemClock,
  appUrl: env.APP_URL,
};

export const tenantOnboarding = createTenantOnboarding(dependencies);

export const memberManagement = createMemberManagement(dependencies);

export const channelService = createChannelService({
  db,
  clock: systemClock,
  getWhatsApp: createWhatsAppGateway,
});
