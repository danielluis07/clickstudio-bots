import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/database";
import { message } from "@/db/schema";
import type { ChannelRoute } from "@/modules/channels";

export const findMessageConversation = async (db: Database, route: ChannelRoute, wamid: string, direction: "inbound" | "outbound") => {
  const [found] = await db.select({ conversationId: message.conversationId }).from(message)
    .where(and(eq(message.tenantId, route.tenantId), eq(message.wamid, wamid), eq(message.direction, direction)));
  return found?.conversationId ?? null;
};
