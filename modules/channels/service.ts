import { z } from "zod";
import type { Database } from "@/db/database";
import { createChannelRepository, resolveChannelPhoneNumber } from "@/modules/channels/repository";
import type { WhatsAppGateway } from "@/modules/channels/whatsapp-gateway";
import type { TenantScope } from "@/modules/tenancy";
import type { Clock } from "@/platform/clock";
import { whatsAppWebhookFields } from "@/platform/whatsapp";

const signupSchema = z.object({
  code: z.string().min(1).max(4096),
  wabaId: z.string().regex(/^\d{1,30}$/),
  phoneNumberId: z.string().regex(/^\d{1,30}$/).optional(),
});

export type ChannelSignup = z.input<typeof signupSchema>;
// Meta accepts the contacts and history requests within 24 hours of onboarding.
const syncWindowMs = 24 * 60 * 60 * 1000;

const appSyncs = [
  // Meta's order: contacts first, then history.
  { sync: "contactsSync", syncType: "smb_app_state_sync" },
  { sync: "historySync", syncType: "history" },
] as const;

export const createChannelService = ({ db, clock, getWhatsApp }: {
  db: Database;
  clock: Clock;
  getWhatsApp: () => WhatsAppGateway;
}) => {
  // Channels onboarded before this can no longer ask Meta for a sync.
  const syncWindowOpenedAfter = () => new Date(clock.now().getTime() - syncWindowMs);

  // Asks once for the app's contacts and history. A refused request is final:
  // Meta allows no second attempt without onboarding again.
  const requestAppSyncs = async (scope: TenantScope, stored: NonNullable<Awaited<ReturnType<ReturnType<typeof createChannelRepository>["getCredential"]>>>) => {
    const repository = createChannelRepository(db, scope);
    const onboardedAfter = syncWindowOpenedAfter();
    for (const { sync, syncType } of appSyncs) {
      if (!await repository.claimSync(sync, onboardedAfter)) continue;
      const result = await Promise.resolve().then(() => getWhatsApp().requestAppSync({ ...stored, syncType }))
        .catch(() => ({ ok: false }));
      if (!result.ok) await repository.recordSyncFailure(sync);
    }
  };

  const subscribe = async (scope: TenantScope) => {
    const repository = createChannelRepository(db, scope);
    const stored = await repository.getCredential();
    if (!stored) return { ok: false as const, error: "not_found" as const };
    const result = await Promise.resolve().then(() => getWhatsApp().subscribe(stored))
      .catch(() => ({ ok: false as const, error: "subscription_failed" as const }));
    await repository.recordSubscription({
      subscriptionStatus: result.ok ? "subscribed" : "failed",
      subscriptionAttemptedAt: clock.now(),
      subscriptionError: result.ok ? null : result.error,
    });
    // History arrives as webhooks, so it is requested only once they flow.
    if (result.ok) await requestAppSyncs(scope, stored);
    return { ok: true as const };
  };

  const getChannel = async (scope: TenantScope) => {
    const found = await createChannelRepository(db, scope).getChannel();
    if (!found) return null;
    const { historySync, createdAt, ...summary } = found;
    const windowClosed = createdAt <= syncWindowOpenedAfter();
    return {
      ...summary,
      // Shown as "Histórico não importado": refused, declined or never requested in time.
      historyNotImported: historySync === "failed" || historySync === "declined" || (historySync === "pending" && windowClosed),
    };
  };

  return {
    getChannel,
    resolvePhoneNumber(phoneNumberId: string) {
      return resolveChannelPhoneNumber(db, phoneNumberId);
    },
    async connect(scope: TenantScope, input: ChannelSignup) {
      if (scope.role !== "owner") return { ok: false as const, error: "forbidden" as const };
      const parsed = signupSchema.safeParse(input);
      if (!parsed.success) return { ok: false as const, error: "invalid" as const };
      const repository = createChannelRepository(db, scope);
      if (await repository.getChannel()) return { ok: false as const, error: "already_connected" as const };
      const exchanged = await Promise.resolve()
        .then(() => getWhatsApp().exchangeSignup({ ...parsed.data, tenantId: scope.tenantId }))
        .catch(() => null);
      if (!exchanged) return { ok: false as const, error: "signup_failed" as const };
      // Unique constraints decide races without holding a transaction over Meta.
      const inserted = await repository.insert({
        ...exchanged, wabaId: parsed.data.wabaId, subscriptionFields: [...whatsAppWebhookFields], createdAt: clock.now(),
      });
      if (!inserted) return { ok: false as const, error: "channel_conflict" as const };
      await subscribe(scope);
      return { ok: true as const };
    },
    async retrySubscription(scope: TenantScope) {
      if (scope.role !== "owner") return { ok: false as const, error: "forbidden" as const };
      return subscribe(scope);
    },
  };
};

export type ChannelSummary = NonNullable<Awaited<ReturnType<ReturnType<typeof createChannelService>["getChannel"]>>>;
