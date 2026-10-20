import type { Database } from "@/db/database";
import { channel, member, organization, user } from "@/db/schema";
import { resolveChannelPhoneNumber } from "@/modules/channels";
import { recordInboundTextMessage } from "@/modules/conversations";
import { resolveTenantScope } from "@/modules/tenancy";

export const seedConversations = async (db: Database) => {
  await db.insert(user).values([
    { id: "member-a", name: "Member A", email: "a@example.com" },
    { id: "member-b", name: "Member B", email: "b@example.com" },
    { id: "outsider", name: "No membership", email: "none@example.com" },
  ]);
  await db.insert(organization).values([
    { id: "tenant-a", name: "Tenant A", slug: "a" },
    { id: "tenant-b", name: "Tenant B", slug: "b" },
  ]);
  await db.insert(member).values([
    { organizationId: "tenant-a", userId: "member-a", role: "member" },
    { organizationId: "tenant-b", userId: "member-b", role: "owner" },
  ]);
  const credential = { keyVersion: "v1", iv: "", ciphertext: "", tag: "" };
  await db.insert(channel).values([
    { id: "channel-a", tenantId: "tenant-a", wabaId: "100", phoneNumberId: "200", displayPhoneNumber: "+5511999990000", credential, subscriptionFields: [] },
    { id: "channel-b", tenantId: "tenant-b", wabaId: "101", phoneNumberId: "201", displayPhoneNumber: "+5511999990001", credential, subscriptionFields: [] },
  ]);
  const routeA = (await resolveChannelPhoneNumber(db, "200"))!;
  const routeB = (await resolveChannelPhoneNumber(db, "201"))!;
  const inbound = (from: string, profileName: string, wamid: string, text: string, sentAt: string) =>
    ({ from, profileName, wamid, text, sentAt: new Date(sentAt) });
  await recordInboundTextMessage(db, routeA, inbound("5511988881111", "Ana Silva", "ana-1", "Primeira mensagem", "2026-10-20T10:00:00Z"));
  await recordInboundTextMessage(db, routeA, inbound("5511988882222", "Bruno Costa", "bruno-1", "Quero agendar", "2026-10-20T12:30:00Z"));
  await recordInboundTextMessage(db, routeA, inbound("5511988881111", "Ana Silva", "ana-3", "Mensagem mais recente", "2026-10-20T12:00:00Z"));
  // An out-of-order webhook must not move the Conversation backwards.
  await recordInboundTextMessage(db, routeA, inbound("5511988881111", "Ana Silva", "ana-2", "Mensagem atrasada", "2026-10-20T10:30:00Z"));
  await recordInboundTextMessage(db, routeB, inbound("5511988881111", "Ana de outro negócio", "other-1", "Mensagem privada", "2026-10-20T13:00:00Z"));
  return {
    scopeA: (await resolveTenantScope(db, { userId: "member-a" }))!,
    scopeB: (await resolveTenantScope(db, { userId: "member-b" }))!,
    routeA,
  };
};
