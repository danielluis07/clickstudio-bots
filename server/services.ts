import { db } from "@/db";
import { systemClock } from "@/platform/clock";
import { env } from "@/platform/env";
import { createMemberManagement, createTenantOnboarding } from "@/modules/tenancy";
import { createResendMailer } from "@/platform/resend-mailer";
import { createChannelService } from "@/modules/channels";
import { createWhatsAppGateway } from "@/server/whatsapp";
import { createWebhookInbox } from "@/modules/webhook-inbox";
import { createQStashJobQueue, createQStashJobVerifier, qstashJobUrl } from "@/platform/qstash";
import { createInboxJobRoute, createWhatsAppWebhookRoute } from "@/server/webhook-routes";

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

const webhookInbox = env.META_APP_SECRET && env.QSTASH_TOKEN
  ? createWebhookInbox({
    db,
    clock: systemClock,
    appSecret: env.META_APP_SECRET,
    queue: createQStashJobQueue({ token: env.QSTASH_TOKEN, baseUrl: env.QSTASH_URL, appUrl: env.APP_URL }),
  })
  : null;

// Unconfigured, both routes refuse requests rather than drop events.
export const whatsAppWebhookRoute = createWhatsAppWebhookRoute({
  inbox: webhookInbox,
  verifyToken: env.META_WEBHOOK_VERIFY_TOKEN ?? null,
});

export const inboxJobRoute = createInboxJobRoute(
  webhookInbox && env.QSTASH_CURRENT_SIGNING_KEY && env.QSTASH_NEXT_SIGNING_KEY
    ? {
      inbox: webhookInbox,
      verifier: createQStashJobVerifier({
        currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
        nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
      }),
      url: qstashJobUrl(env.APP_URL, "process-inbox-event"),
    }
    : null,
);
