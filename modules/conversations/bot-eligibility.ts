import { sql } from "drizzle-orm";
import { channel, conversation, organization } from "@/db/schema";

// The Bot may reply in a Conversation only while it owns it and its Channel is
// activated, unpaused, subscribed and healthy. The reply gate reads this and
// the reservation fences on it, so both always agree. An unhealthy Channel
// leaves its Conversations with the Bot, which resumes once it is healthy:
// Members could not send from it either (#145). A Suspended Tenant (billing)
// also keeps its Conversations with the Bot until the suspension is lifted.
// Only the Bot sees suspension: `activeTenant` (channels) ignores it, so
// Members of a Suspended Tenant still send from its Channel.
export const botEligible = sql`(${conversation.owner} = 'bot' and exists(
  select 1 from ${channel} where ${channel.id} = ${conversation.channelId}
  and ${channel.botEnabled} and not ${channel.botPaused} and ${channel.subscriptionStatus} = 'subscribed'
  and ${channel.health} = 'healthy'
  and exists(select 1 from ${organization} where ${organization.id} = ${channel.tenantId}
    and ${organization.canceledAt} is null and ${organization.suspendedAt} is null)
))`;
