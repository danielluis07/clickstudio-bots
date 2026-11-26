import { db } from "@/db";
import { systemClock } from "@/platform/clock";
import { env } from "@/platform/env";
import {
  createMemberManagement,
  createMemberTour,
  createTenantOnboarding,
  createTenantRepository,
  createTenantLifecycle,
  pruneCanceledTenants,
} from "@/modules/tenancy";
import { createResendMailer } from "@/platform/resend-mailer";
import { createBilling } from "@/modules/billing";
import { pruneSignInAttempts } from "@/modules/identity";
import { createChannelService, sweepChannelHealth } from "@/modules/channels";
import {
  createContactDeletion,
  createConversationRepository,
  createConversationStats,
  createHandoffControls,
  createMemberAlertPreferences,
  createMemberAlerts,
  createReplyService,
  pruneAlerts,
  pruneEarlyMessageStatuses,
  returnQuietHandoffs,
} from "@/modules/conversations";
import type { TenantScope } from "@/modules/tenancy";
import { createKnowledgeBaseEditor } from "@/modules/knowledge-base";
import {
  createBotSandbox,
  createBotActivation,
  createBotAllowance,
  createBotSettingsEditor,
  createCaptureSettingsEditor,
  createLinkSettingsEditor,
  createLiveBot,
  alertBotHandoffSpikes,
  pruneBotTurnRecords,
  readBotSettings,
} from "@/modules/bot";
import { createBotModel } from "@/platform/ai-sdk-model";
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
import { createBotJobRoute } from "@/server/bot-jobs";
import { alertStaleSweep, createSweepRoute, recordSweepRun } from "@/server/sweep";

export const diagnostics = createDiagnostics({ dsn: env.SENTRY_DSN });

export const realtime = env.ABLY_API_KEY ? createAblyRealtime({ apiKey: env.ABLY_API_KEY }) : null;
// Messaging continues when realtime has not been configured locally.
export const notifier: Notifier = realtime ?? {
  publish: async () => {},
  publishAlert: async () => {},
};

export const mailer = createResendMailer({
  apiKey: env.RESEND_API_KEY,
  from: env.EMAIL_FROM,
});

// The wiring every service shares.
const base = { db, clock: systemClock };

const dependencies = {
  ...base,
  mailer,
  appUrl: env.APP_URL,
};

// Off in production until launch (ADR 0012).
export const billing = createBilling({ ...base, enabled: env.BILLING_ENABLED });

export const tenantOnboarding = createTenantOnboarding({
  ...dependencies,
  trialEndFor: billing.trialEndFor,
});
export const tenantLifecycle = createTenantLifecycle({
  ...base,
  getWhatsApp: createWhatsAppGateway,
});

export const memberManagement = createMemberManagement(dependencies);

export const channelService = createChannelService({
  ...base,
  getWhatsApp: createWhatsAppGateway,
});

export const knowledgeBaseEditor = createKnowledgeBaseEditor(base);

export const botSettingsEditor = createBotSettingsEditor(base);

export const botActivation = createBotActivation(base);
export const handoffControls = createHandoffControls({ ...base, notifier });
export const contactDeletion = createContactDeletion({ ...base, notifier });
export const conversationRepository = (scope: TenantScope) =>
  createConversationRepository(db, scope);
export const tenantRepository = (scope: TenantScope) => createTenantRepository(db, scope);
export const memberAlerts = (scope: TenantScope) => createMemberAlerts(base, scope);

export const memberAlertPreferences = (scope: TenantScope) =>
  createMemberAlertPreferences(base, scope);
export const memberTour = (scope: TenantScope) => createMemberTour(base, scope);
export const conversationStats = createConversationStats({
  ...base,
  readBusinessHours: async (scope) => (await readBotSettings(db, scope)).hours,
});

export const captureSettingsEditor = createCaptureSettingsEditor(base);
export const linkSettingsEditor = createLinkSettingsEditor(base);

const model = createBotModel({
  gatewayApiKey: env.AI_GATEWAY_API_KEY,
  anthropicApiKey: env.ANTHROPIC_API_KEY,
  modelId: env.AI_MODEL_ID,
});
const queue = env.QSTASH_TOKEN
  ? createQStashJobQueue({ token: env.QSTASH_TOKEN, baseUrl: env.QSTASH_URL, appUrl: env.APP_URL })
  : null;

export const botAllowance = createBotAllowance({ ...base, mailer });

export const liveBot = queue
  ? createLiveBot({
      ...base,
      model,
      queue,
      notifier,
      getSender: createWhatsAppGateway,
      allowance: botAllowance,
    })
  : null;

export const botSandbox = createBotSandbox({
  ...base,
  model,
  activation: botActivation,
});

export const replyService = createReplyService({
  ...base,
  notifier,
  getSender: createWhatsAppGateway,
});

export const webhookInbox =
  env.META_APP_SECRET && env.QSTASH_TOKEN
    ? createWebhookInbox({
        ...base,
        notifier,
        diagnostics,
        bot: liveBot,
        appSecret: env.META_APP_SECRET,
        queue: queue!,
      })
    : null;

// Unconfigured, both routes refuse requests rather than drop events.
export const whatsAppWebhookRoute = createWhatsAppWebhookRoute({
  inbox: webhookInbox,
  verifyToken: env.META_WEBHOOK_VERIFY_TOKEN ?? null,
  diagnostics,
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
  diagnostics,
);

export const dailyCronRoute = createDailyCronRoute({
  secret: env.CRON_SECRET ?? null,
  diagnostics,
  tasks: [
    { name: "disconnect-canceled-channels", run: () => tenantLifecycle.retryDisconnections() },
    { name: "delete-canceled-tenants", run: () => pruneCanceledTenants(db, systemClock) },
    { name: "prune-inbox", run: () => pruneInboxEvents(db, systemClock) },
    { name: "retry-reply-warnings", run: () => botAllowance.retryWarnings() },
    { name: "prune-bot-turn-records", run: () => pruneBotTurnRecords(db, systemClock) },
    { name: "prune-early-statuses", run: () => pruneEarlyMessageStatuses(db, systemClock) },
    { name: "prune-alerts", run: () => pruneAlerts(db, systemClock) },
    { name: "prune-sign-in-attempts", run: () => pruneSignInAttempts(db, systemClock) },
    // Vercel calls this independently of QStash, so it notices a dead sweep.
    {
      name: "alert-stale-sweep",
      run: () => alertStaleSweep({ ...base, diagnostics }),
    },
  ],
});

// Called every 30 minutes by a QStash schedule (ADR 0007).
export const sweepRoute = createSweepRoute({
  config:
    env.QSTASH_CURRENT_SIGNING_KEY && env.QSTASH_NEXT_SIGNING_KEY
      ? {
          url: qstashJobUrl(env.APP_URL, "sweep"),
          verifier: createQStashJobVerifier({
            currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
            nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
          }),
        }
      : null,
  diagnostics,
  tasks: [
    // Alerts first: after a large incident the recovery tasks below can use
    // the whole time limit, and the alerts matter most then.
    { name: "alert-stale-inbox", run: async () => webhookInbox?.alertStaleQueue() },
    {
      name: "alert-bot-handoff-spikes",
      run: () => alertBotHandoffSpikes({ ...base, diagnostics }),
    },
    {
      name: "check-channel-health",
      run: () => sweepChannelHealth({ ...base, diagnostics }),
    },
    // Before the Bot's own recovery, so a Tenant whose Trial just ended gets
    // no stranded turn re-enqueued in the same run.
    { name: "enforce-billing", run: () => billing.sweep() },
    { name: "requeue-inbox-events", run: async () => webhookInbox?.requeueStalled() },
    { name: "retry-failed-inbox-events", run: async () => webhookInbox?.retryFailed() },
    { name: "sweep-bot-turns", run: async () => liveBot?.sweep() },
    {
      name: "return-quiet-handoffs",
      run: () => returnQuietHandoffs({ ...base, notifier }),
    },
    // Last, so the daily cron's watchdog sees when a run reached its end.
    { name: "record-sweep-run", run: () => recordSweepRun(base) },
  ],
});

export const botJobRoute = createBotJobRoute(
  liveBot && env.QSTASH_CURRENT_SIGNING_KEY && env.QSTASH_NEXT_SIGNING_KEY
    ? {
        bot: liveBot,
        url: qstashJobUrl(env.APP_URL, "run-bot-turn"),
        verifier: createQStashJobVerifier({
          currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
          nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
        }),
      }
    : null,
  diagnostics,
);
