import { hashPassword } from "better-auth/crypto";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { channel, conversation, member, organization, user } from "@/db/schema";
import { resolveChannelPhoneNumber } from "@/modules/channels";
import {
  createReplyService,
  recordInboundTextMessage,
  recordMessageChange,
  recordMessageEcho,
  recordMessageStatus,
} from "@/modules/conversations";
import { createUserRepository } from "@/modules/identity";
import { createMemberManagement, resolveTenantScope } from "@/modules/tenancy";
import { systemClock } from "@/platform/clock";
import { env } from "@/platform/env";

// Usage: bun run db:seed
// Recreates a demo Tenant on the dev database: an owner who can sign in, an
// open and a closed service window, replies in each delivery status, a reply
// by a removed Member, a reply from the WhatsApp Business app, and edited and
// deleted messages. Times are relative to now, so re-run it to
// reopen the window.
// Local `.env` holds the dev branch; production's URL lives only in Vercel.
// A local APP_URL is the sign that this is not a deployment.
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(env.APP_URL).hostname)) {
  console.error(`Refusing to seed: APP_URL (${env.APP_URL}) is not local.`);
  process.exit(1);
}

const tenantId = "seed-tenant";
const ownerEmail = "dono.teste@example.com";
const attendantEmail = "atendente.teste@example.com";
const password = process.env.SEED_PASSWORD ?? "senha-teste-123";
const hours = (count: number) => new Date(Date.now() - count * 60 * 60 * 1000);

await db.delete(organization).where(inArray(organization.id, [tenantId]));
await db.delete(user).where(inArray(user.email, [ownerEmail, attendantEmail]));

const users = createUserRepository(db);
const passwordHash = await hashPassword(password);
const owner = await users.createWithPassword({
  name: "Olga Dona",
  email: ownerEmail,
  emailVerified: true,
  passwordHash,
});
const attendant = await users.createWithPassword({
  name: "Ari Atendente",
  email: attendantEmail,
  emailVerified: true,
  passwordHash,
});
await db
  .insert(organization)
  .values({ id: tenantId, name: "Clínica Teste", slug: "clinica-teste" });
await db.insert(member).values([
  { organizationId: tenantId, userId: owner.id, role: "owner" },
  { organizationId: tenantId, userId: attendant.id, role: "member" },
]);
// A placeholder credential: sends from it fail, and the dashboard shows that.
await db.insert(channel).values({
  tenantId,
  wabaId: "999000000000002",
  phoneNumberId: "999000000000001",
  displayPhoneNumber: "+55 11 90000-0000",
  credential: { keyVersion: "seed", iv: "", ciphertext: "", tag: "" },
  subscriptionFields: [],
});

const route = (await resolveChannelPhoneNumber(db, "999000000000001"))!;
const ownerScope = (await resolveTenantScope(db, { userId: owner.id }))!;
const attendantScope = (await resolveTenantScope(db, { userId: attendant.id }))!;
const receive = (wamid: string, from: string, profileName: string, text: string, sentAt: Date) =>
  recordInboundTextMessage(db, route, { wamid, from, profileName, text, sentAt });

await receive(
  "wamid.SEED.IN1",
  "5511988887777",
  "Ana Souza",
  "Olá! Vocês abrem no sábado?",
  hours(1),
);
await receive(
  "wamid.SEED.IN2",
  "5521977776666",
  "Bruno Lima",
  "Qual o valor da consulta?",
  hours(30),
);

// Stands in for Meta: accepts each send, except the last, which it refuses.
let sends = 0;
const replies = createReplyService({
  db,
  clock: systemClock,
  notifier: { publish: async () => {} },
  getSender: () => ({
    async sendText() {
      if (++sends === 3) throw new Error("refused");
      return { wamid: `wamid.SEED.OUT${sends}` };
    },
  }),
});
const [anaConversation] = await db
  .select({ id: conversation.id })
  .from(conversation)
  .where(eq(conversation.tenantId, tenantId))
  .orderBy(desc(conversation.lastMessageAt))
  .limit(1);
await replies.sendReply(attendantScope, {
  conversationId: anaConversation.id,
  text: "Abrimos sim, das 9h às 13h.",
});
await replies.sendReply(ownerScope, {
  conversationId: anaConversation.id,
  text: "Quer agendar um horário?",
});
await replies.sendReply(ownerScope, {
  conversationId: anaConversation.id,
  text: "Esta não chega: o Meta recusou.",
});
await recordMessageStatus(db, route, {
  wamid: "wamid.SEED.OUT1",
  status: "read",
  receivedAt: new Date(),
});
await recordMessageStatus(db, route, {
  wamid: "wamid.SEED.OUT2",
  status: "delivered",
  receivedAt: new Date(),
});

// Coexistence: our own send's echo adds nothing; a reply from the app does.
const echo = (wamid: string, text: string, sentAt: Date) =>
  recordMessageEcho(db, route, { wamid, to: "5511988887777", text, sentAt });
await echo("wamid.SEED.OUT1", "Abrimos sim, das 9h às 13h.", new Date());
await echo("wamid.SEED.APP1", "Pode vir às 10h, te espero!", new Date());
await receive(
  "wamid.SEED.IN3",
  "5511988887777",
  "Ana Souza",
  "Mensagem enviada por engano",
  new Date(),
);
// The Contact edits a message and deletes another; a Member edits the app reply.
const changedAt = new Date();
await recordMessageChange(db, route, {
  phone: "5511988887777",
  wamid: "wamid.SEED.EDIT1",
  originalWamid: "wamid.SEED.IN1",
  direction: "inbound",
  changedAt,
  kind: "edit",
  text: "Olá! Vocês abrem no sábado e no domingo?",
});
await recordMessageChange(db, route, {
  phone: "5511988887777",
  wamid: "wamid.SEED.EDIT2",
  originalWamid: "wamid.SEED.APP1",
  direction: "outbound",
  changedAt,
  kind: "edit",
  text: "Pode vir às 10h30, te espero!",
});
await recordMessageChange(db, route, {
  phone: "5511988887777",
  wamid: "wamid.SEED.REVOKE1",
  originalWamid: "wamid.SEED.IN3",
  direction: "inbound",
  changedAt,
  kind: "revoke",
});

await createMemberManagement({
  db,
  clock: systemClock,
  appUrl: env.APP_URL,
  mailer: { send: async () => {} },
}).removeMember(ownerScope, attendantScope.memberId);

console.log(
  `Seeded Tenant "Clínica Teste". Sign in at ${env.APP_URL}/entrar as ${ownerEmail} / ${password}`,
);
process.exit(0);
