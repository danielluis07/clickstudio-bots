import { inArray, like } from "drizzle-orm";
import { db } from "@/db";
import { channel, memberActivity, organization, user } from "@/db/schema";
import { resolveChannelPhoneNumber } from "@/modules/channels";
import { recordInboundTextMessage } from "@/modules/conversations";
import { createPlatformAdmin } from "@/modules/identity";
import { createTenantOnboarding } from "@/modules/tenancy";
import { systemClock } from "@/platform/clock";
import { env } from "@/platform/env";
import { createWhatsAppTokenCipher } from "@/platform/whatsapp-credentials";
import { e2eAccessToken, e2eDatabaseUrl, type E2eFixtures } from "@/test/e2e/environment";

// Usage: run by the browser suite's global setup (docs/browser-tests.md).
// Recreates the suite's Tenants and prints them as JSON on the last line:
// two Tenants with a connected Channel and one Conversation each, and a
// third whose owner invitation is still pending.
if (env.DATABASE_URL !== e2eDatabaseUrl()) {
  console.error("Refusing to seed: DATABASE_URL is not E2E_DATABASE_URL.");
  process.exit(1);
}

const emailDomain = "e2e.example.com";
const password = "senha-e2e-123";

// The suite's Tenants all have an "e2e-" slug, and its users this domain.
const stale = await db
  .select({ id: organization.id })
  .from(organization)
  .where(like(organization.slug, "e2e-%"));
const staleIds = stale.map(({ id }) => id);
if (staleIds.length > 0) {
  await db.delete(organization).where(inArray(organization.id, staleIds));
  // Allowed by the append-only trigger now that the Tenants are gone.
  await db.delete(memberActivity).where(inArray(memberActivity.tenantId, staleIds));
}
await db.delete(user).where(like(user.email, `%@${emailDomain}`));

const admin = await createPlatformAdmin(db, {
  name: "Admin E2E",
  email: `admin@${emailDomain}`,
  password,
});
const onboarding = createTenantOnboarding({
  db,
  clock: systemClock,
  appUrl: env.APP_URL,
  mailer: { send: async () => {} },
});
const cipher = createWhatsAppTokenCipher(
  env.WHATSAPP_TOKEN_KEY_VERSION!,
  JSON.parse(env.WHATSAPP_TOKEN_KEYS!) as Record<string, string>,
);

const createTenant = async (tenantName: string, ownerEmail: string) => {
  const created = await onboarding.createTenant(admin.id, { tenantName, ownerEmail });
  if (!created.ok) throw new Error(`Could not create ${tenantName}: ${created.error}`);
  return created;
};

const seedTenant = async (input: {
  slug: string;
  name: string;
  ownerName: string;
  phoneNumberId: string;
  wabaId: string;
  contact: { name: string; phone: string; text: string };
}) => {
  const ownerEmail = `dono.${input.slug}@${emailDomain}`;
  const { tenantId, invitationId } = await createTenant(input.name, ownerEmail);
  const accepted = await onboarding.acceptInvitation({
    invitationId,
    acceptedTerms: true,
    name: input.ownerName,
    password,
  });
  if (!accepted.ok) throw new Error(`Could not accept for ${input.name}: ${accepted.error}`);

  const context = { tenantId, wabaId: input.wabaId, phoneNumberId: input.phoneNumberId };
  await db.insert(channel).values({
    ...context,
    displayPhoneNumber: "+55 11 90000-0000",
    credential: cipher.encrypt(e2eAccessToken, context),
    subscriptionFields: [],
  });
  const route = await resolveChannelPhoneNumber(db, input.phoneNumberId);
  if (!route) throw new Error(`No Channel route for ${input.name}`);
  // Received now, so the 24-hour service window is open.
  const conversationId = await recordInboundTextMessage(db, route, {
    wamid: `wamid.E2E.${input.slug}`,
    from: input.contact.phone,
    profileName: input.contact.name,
    text: input.contact.text,
    sentAt: new Date(),
  });
  if (!conversationId) throw new Error(`No Conversation for ${input.name}`);

  return {
    name: input.name,
    ownerEmail,
    contactName: input.contact.name,
    conversationId,
    inboundText: input.contact.text,
  };
};

const alfa = await seedTenant({
  slug: "alfa",
  name: "E2E Clínica Alfa",
  ownerName: "Olga Alfa",
  phoneNumberId: "990000000000011",
  wabaId: "990000000000012",
  contact: { name: "Ana Alfa", phone: "5511988880001", text: "Olá! Vocês abrem no sábado?" },
});
const beta = await seedTenant({
  slug: "beta",
  name: "E2E Clínica Beta",
  ownerName: "Bia Beta",
  phoneNumberId: "990000000000021",
  wabaId: "990000000000022",
  contact: { name: "Bruno Beta", phone: "5511988880002", text: "Mensagem só da Clínica Beta" },
});

const invitationEmail = `dono.convite@${emailDomain}`;
const pending = await createTenant("E2E Clínica Convite", invitationEmail);

const fixtures: E2eFixtures = {
  password,
  alfa,
  beta,
  invitation: {
    id: pending.invitationId,
    tenantName: "E2E Clínica Convite",
    email: invitationEmail,
  },
};
console.log(JSON.stringify(fixtures));
process.exit(0);
