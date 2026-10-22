import { db } from "@/db";
import { systemClock } from "@/platform/clock";
import { env } from "@/platform/env";
import { createMemberManagement, createTenantOnboarding } from "@/modules/tenancy";
import { createResendMailer } from "@/platform/resend-mailer";
import { createChannelService } from "@/modules/channels";
import { createReplyService } from "@/modules/conversations";
import { createKnowledgeBaseEditor } from "@/modules/knowledge-base";
import { createBotSandbox, createBotSettingsEditor } from "@/modules/bot";
import { createAiSdkModel, createAnthropicLanguageModel } from "@/platform/ai-sdk-model";
import { createWhatsAppGateway } from "@/server/whatsapp";
import { createWebhookInbox, pruneInboxEvents } from "@/modules/webhook-inbox";
import { createQStashJobQueue, createQStashJobVerifier, qstashJobUrl } from "@/platform/qstash";
import {
  createInboxFailureRoute,
  createInboxJobRoute,
  createWhatsAppWebhookRoute,
} from "@/server/webhook-routes";
import { createAblyRealtime } from "@/platform/ably";
import type { Notifier } from "@/platform/notifier";
import { createDiagnostics } from "@/platform/sentry";
import { createDailyCronRoute } from "@/server/daily-cron";

const diagnostics = createDiagnostics({ dsn: env.SENTRY_DSN });

export const realtime = env.ABLY_API_KEY ? createAblyRealtime({ apiKey: env.ABLY_API_KEY }) : null;
// Messaging continues when realtime has not been configured locally.
export const notifier: Notifier = realtime ?? { publish: async () => {} };

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

export const knowledgeBaseEditor = createKnowledgeBaseEditor({ db, clock: systemClock });

export const botSettingsEditor = createBotSettingsEditor({ db, clock: systemClock });

export const botSandbox = createBotSandbox({
  db,
  clock: systemClock,
  model: env.ANTHROPIC_API_KEY
    ? createAiSdkModel({ model: createAnthropicLanguageModel({ apiKey: env.ANTHROPIC_API_KEY }) })
    : null,
});

export const replyService = createReplyService({
  db,
  clock: systemClock,
  notifier,
  getSender: createWhatsAppGateway,
});

export const webhookInbox =
  env.META_APP_SECRET && env.QSTASH_TOKEN
    ? createWebhookInbox({
        db,
        clock: systemClock,
        notifier,
        diagnostics,
        appSecret: env.META_APP_SECRET,
        queue: createQStashJobQueue({
          token: env.QSTASH_TOKEN,
          baseUrl: env.QSTASH_URL,
          appUrl: env.APP_URL,
        }),
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
  diagnostics,
);

export const inboxFailureRoute = createInboxFailureRoute(
  webhookInbox && env.QSTASH_CURRENT_SIGNING_KEY && env.QSTASH_NEXT_SIGNING_KEY
    ? {
        inbox: webhookInbox,
        verifier: createQStashJobVerifier({
          currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
          nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
        }),
        url: qstashJobUrl(env.APP_URL, "inbox-event-failed"),
        sourceUrl: qstashJobUrl(env.APP_URL, "process-inbox-event"),
      }
    : null,
);

export const dailyCronRoute = createDailyCronRoute({
  secret: env.CRON_SECRET ?? null,
  diagnostics,
  tasks: [{ name: "prune-inbox", run: () => pruneInboxEvents(db, systemClock) }],
});
