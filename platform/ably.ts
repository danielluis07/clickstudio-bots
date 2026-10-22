import { Rest } from "ably";
import type { Notifier } from "@/platform/notifier";

const tenantInboxChannel = (tenantId: string) => `tenant:${tenantId}:inbox`;

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
    async issueToken(tenantId: string, memberId: string) {
      const channel = tenantInboxChannel(tenantId);
      const tokenRequest = await client.auth.createTokenRequest({
        clientId: memberId,
        capability: JSON.stringify({ [channel]: ["subscribe"] }),
        ttl: 5 * 60 * 1000,
      });
      return { channel, tokenRequest };
    },
  } satisfies Notifier & { issueToken: unknown };
};

export type AblyRealtime = ReturnType<typeof createAblyRealtime>;
