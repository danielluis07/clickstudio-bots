import { Rest } from "ably";
import type { Notifier } from "@/platform/notifier";

const tenantInboxChannel = (tenantId: string) => `tenant:${tenantId}:inbox`;
const memberAlertsChannel = (tenantId: string, memberId: string) =>
  `tenant:${tenantId}:member:${memberId}:alerts`;

export const createAblyRealtime = ({ apiKey }: { apiKey: string }) => {
  const client = new Rest({ key: apiKey, httpRequestTimeout: 5000 });

  return {
    async publish(tenantId, ping) {
      // Project the payload explicitly so extra runtime properties cannot
      // accidentally send message text or phone numbers to Ably.
      const data =
        "conversationId" in ping
          ? { conversationId: ping.conversationId }
          : { contactId: ping.contactId };
      await client.channels.get(tenantInboxChannel(tenantId)).publish("invalidate", data);
    },
    async publishAlert(tenantId, { memberId, alertId }) {
      await client.channels
        .get(memberAlertsChannel(tenantId, memberId))
        .publish("alert", { alertId });
    },
    // Subscribe access to the Tenant's inbox and to the Member's own Alerts,
    // never another Member's.
    async issueToken(tenantId: string, memberId: string) {
      const channel = tenantInboxChannel(tenantId);
      const alertsChannel = memberAlertsChannel(tenantId, memberId);
      const tokenRequest = await client.auth.createTokenRequest({
        clientId: memberId,
        capability: JSON.stringify({ [channel]: ["subscribe"], [alertsChannel]: ["subscribe"] }),
        ttl: 5 * 60 * 1000,
      });
      return { channel, alertsChannel, tokenRequest };
    },
  } satisfies Notifier & { issueToken: unknown };
};

export type AblyRealtime = ReturnType<typeof createAblyRealtime>;
