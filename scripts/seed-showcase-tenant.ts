import { hashPassword } from "better-auth/crypto";
import { eq, inArray, like } from "drizzle-orm";
import { db } from "@/db";
import {
  botActivation,
  botCaptureSettings,
  botLinkSettings,
  botReplyUsage,
  botSettings,
  channel,
  contact,
  conversation,
  handoffEvent,
  knowledgeBaseEntry,
  member,
  memberActivity,
  message,
  organization,
  user,
} from "@/db/schema";
import { createUserRepository } from "@/modules/identity";
import { weekdays } from "@/modules/bot";
import { env } from "@/platform/env";
import {
  dayMs as day,
  hourMs as hour,
  minuteMs as minute,
  localDay,
  startOfLocalDay,
} from "@/platform/time";
import {
  botBehaviour,
  botProfile,
  businessHours,
  captureFields,
  clinic,
  knowledgeBase,
  links,
  team,
} from "@/scripts/showcase/clinic";
import { createPeople, type Person } from "@/scripts/showcase/people";
import { createRandom } from "@/scripts/showcase/random";
import { drawScenario, type ScenarioContext, type Step } from "@/scripts/showcase/scenarios";

// Usage: bun run db:seed:showcase
// Recreates "Odonto Alameda", a made-up dental clinic with 120 days of
// realistic WhatsApp history, for screenshots and sales demos: a connected
// Channel with the Bot active, a saved profile, behaviour and Knowledge base,
// a few thousand Conversations shaped by weekday and hour, Handoffs to the
// team, and the newest of them still waiting for an answer.
// The same seed builds the same Tenant; every time is relative to now, so
// re-run it before a demo to bring the history up to date.
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(env.APP_URL).hostname)) {
  console.error(`Refusing to seed: APP_URL (${env.APP_URL}) is not local.`);
  process.exit(1);
}

const password = process.env.SEED_PASSWORD ?? "senha-teste-123";
const random = createRandom(20261123);
const newPerson = createPeople(random);
const now = Date.now();
// Longer than the 90-day period, so even it has Contacts who wrote before.
const historyDays = 120;
const uuid = (at: number) => Bun.randomUUIDv7("hex", at);

// São Paulo has had no daylight saving time since 2019: always UTC-3.
const saoPauloOffset = 3 * hour;
const saoPauloToday = localDay(new Date(now));
const todayStart = startOfLocalDay(new Date(now)).getTime();
const saoPauloHour = (at: number) => new Date(at - saoPauloOffset).getUTCHours();

// --- Reset -------------------------------------------------------------------

const stale = await db
  .select({ id: organization.id })
  .from(organization)
  .where(eq(organization.slug, clinic.slug));
if (stale.length > 0) {
  const staleIds = stale.map(({ id }) => id);
  await db.delete(organization).where(inArray(organization.id, staleIds));
  // Allowed by the append-only trigger now that the Tenant is gone.
  await db.delete(memberActivity).where(inArray(memberActivity.tenantId, staleIds));
}
await db.delete(user).where(like(user.email, `%@${clinic.emailDomain}`));

// --- Tenant, team and Bot configuration ---------------------------------------

const createdAt = new Date(todayStart - (historyDays + 5) * day);
const savedAt = new Date(todayStart - (historyDays + 4) * day + 10 * hour);
const knowledgeSavedAt = new Date(savedAt.getTime() + day);
const testedAt = new Date(knowledgeSavedAt.getTime() + day);
const activatedAt = new Date(testedAt.getTime() + hour);

const users = createUserRepository(db);
const passwordHash = await hashPassword(password);
const createMemberUser = (name: string, local: string) =>
  users.createWithPassword({
    name,
    email: `${local}@${clinic.emailDomain}`,
    emailVerified: true,
    passwordHash,
  });
const ownerUser = await createMemberUser(team.owner.name, team.owner.local);
const otherUsers = await Promise.all(
  team.others.map(({ name, local }) => createMemberUser(name, local)),
);

const [{ tenantId }] = await db
  .insert(organization)
  .values({ name: clinic.name, slug: clinic.slug, createdAt, updatedAt: createdAt })
  .returning({ tenantId: organization.id });
const [owner, ...others] = await db
  .insert(member)
  .values([
    { organizationId: tenantId, userId: ownerUser.id, role: team.owner.role, createdAt },
    ...team.others.map(({ role }, index) => ({
      organizationId: tenantId,
      userId: otherUsers[index].id,
      role,
      createdAt,
    })),
  ])
  .returning({ id: member.id });

// A placeholder credential: nothing reaches Meta, and dashboard sends from it
// are refused. Healthy and subscribed, so the dashboard shows it connected.
const [{ channelId }] = await db
  .insert(channel)
  .values({
    tenantId,
    wabaId: clinic.wabaId,
    phoneNumberId: clinic.phoneNumberId,
    displayPhoneNumber: clinic.displayPhoneNumber,
    credential: { keyVersion: "seed", iv: "", ciphertext: "", tag: "" },
    subscriptionStatus: "subscribed",
    subscriptionFields: ["messages"],
    subscriptionAttemptedAt: createdAt,
    contactsSync: "requested",
    historySync: "declined",
    botEnabled: true,
    createdAt,
    updatedAt: activatedAt,
  })
  .returning({ channelId: channel.id });

await db.insert(botSettings).values({
  tenantId,
  ...botProfile,
  ...botBehaviour,
  updatedByMemberId: owner.id,
  updatedAt: savedAt,
  profileUpdatedAt: savedAt,
  profileUpdatedByMemberId: owner.id,
  behaviourUpdatedAt: savedAt,
  behaviourUpdatedByMemberId: owner.id,
});
await db.insert(botCaptureSettings).values({
  tenantId,
  enabled: true,
  fields: captureFields,
  updatedByMemberId: owner.id,
  updatedAt: savedAt,
});
await db.insert(botLinkSettings).values({
  tenantId,
  enabled: true,
  links,
  updatedByMemberId: owner.id,
  updatedAt: savedAt,
});
await db.insert(knowledgeBaseEntry).values(
  knowledgeBase.map((entry, index) => ({
    ...entry,
    tenantId,
    updatedByMemberId: owner.id,
    createdAt: new Date(knowledgeSavedAt.getTime() + index * minute),
    updatedAt: new Date(knowledgeSavedAt.getTime() + index * minute),
  })),
);
await db.insert(botActivation).values({ tenantId, testedAt });

// --- History -----------------------------------------------------------------

// Relative share of Contact activity per São Paulo hour: a morning and an
// afternoon peak, and a busy evening after work, when only the Bot answers.
const hourWeights = [
  1, 0.5, 0.3, 0.2, 0.2, 0.4, 1.2, 3, 6, 8, 8.5, 7.5, 6, 6.5, 7.5, 8, 7, 6.5, 6.5, 7, 6.5, 5, 3.5,
  2,
];
// Sunday first, as Date#getUTCDay counts.
const weekdayFactors = [0.35, 1.15, 1.1, 1.05, 1, 0.95, 0.6];
const weekdayNames = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
// Two days of a social media campaign, about six weeks ago.
const campaignDays = new Set([43, 42]);

// The team works only within Business hours: a reply waits for the opening.
const openingAtOrAfter = (at: number) => {
  for (let cursor = at; ;) {
    const local = new Date(cursor - saoPauloOffset);
    const hours = businessHours[weekdays[(local.getUTCDay() + 6) % 7]];
    // São Paulo midnight of the cursor's day.
    const midnight = cursor - ((cursor - todayStart + historyDays * day) % day);
    if (hours) {
      const [opensH, opensM] = hours.opens.split(":").map(Number);
      const [closesH, closesM] = hours.closes.split(":").map(Number);
      const opens = midnight + opensH * hour + opensM * minute;
      const closes = midnight + closesH * hour + closesM * minute;
      // Not on the dot: the team catches up a few minutes after opening.
      if (cursor < opens) return opens + random.integer(3, 40) * minute;
      if (cursor < closes) return cursor;
    }
    cursor = midnight + day;
  }
};

const teamMembers = [
  { id: others[1].id, label: "a Juliana", weight: 0.55 },
  { id: others[0].id, label: "o Rafael", weight: 0.45 },
];

type ContactRow = typeof contact.$inferInsert;
type ConversationRow = typeof conversation.$inferInsert & { id: string };
type MessageRow = typeof message.$inferInsert & { id: string };
type HandoffRow = typeof handoffEvent.$inferInsert;

const contacts: ContactRow[] = [];
const conversations: ConversationRow[] = [];
const messages: MessageRow[] = [];
const handoffs: HandoffRow[] = [];
// Each Conversation's last session: whether it handed off and was answered.
const lastSession = new Map<
  string,
  { handoff: HandoffRow | null; teamAnswered: boolean; unanswered: MessageRow[]; endedAt: number }
>();
const known: { person: Person; conversation: ConversationRow; lastDay: number }[] = [];
let wamids = 0;

const outboundStatus = (sentAt: number) => {
  const age = now - sentAt;
  if (age < 2 * minute) return random.pick(["sent", "delivered"] as const);
  if (age < hour) return random.chance(0.5) ? "read" : "delivered";
  return random.chance(0.88) ? "read" : "delivered";
};

for (let daysAgo = historyDays - 1; daysAgo >= 0; daysAgo--) {
  const dayIndex = historyDays - 1 - daysAgo;
  const dayStart = todayStart - daysAgo * day;
  const weekday = new Date(dayStart - saoPauloOffset).getUTCDay();
  const growth = 20 + 16 * (dayIndex / (historyDays - 1));
  const campaign = campaignDays.has(daysAgo) ? 1.7 : 1;
  const sessions = Math.round(
    growth * weekdayFactors[weekday] * campaign * random.between(0.85, 1.15),
  );

  for (let session = 0; session < sessions; session++) {
    const start = dayStart + random.weighted(hourWeights) * hour + random.integer(0, 3599) * 1000;
    if (start > now - 3 * minute) continue;

    const returningPool = known.filter(({ lastDay }) => lastDay <= dayIndex - 3);
    const returning = returningPool.length > 0 && random.chance(0.28);
    const scenario = drawScenario(random, returning);
    let entry = returning ? random.pick(returningPool) : undefined;
    if (!entry) {
      const person = newPerson();
      const contactId = uuid(start);
      const captured = scenario.need && random.chance(0.7);
      contacts.push({
        id: contactId,
        tenantId,
        phone: person.phone,
        profileName: person.profileName,
        name: captured ? person.fullName : null,
        city: captured && random.chance(0.8) ? "São Paulo" : null,
        need: captured ? scenario.need : null,
        createdAt: new Date(start),
        updatedAt: new Date(start),
      });
      const row: ConversationRow = {
        id: uuid(start),
        tenantId,
        channelId,
        contactId,
        lastMessageAt: new Date(start),
        createdAt: new Date(start),
      };
      conversations.push(row);
      entry = { person, conversation: row, lastDay: dayIndex };
      known.push(entry);
    }
    entry.lastDay = dayIndex;
    // A Contact returns days later: their earlier Handoff was marked "Resolvida".
    for (const row of lastSession.get(entry.conversation.id)?.unanswered ?? [])
      row.botAnswered = true;
    const conversationId = entry.conversation.id;
    const responder = teamMembers[random.weighted(teamMembers.map(({ weight }) => weight))];
    const localHour = saoPauloHour(start);
    const context: ScenarioContext = {
      random,
      first: entry.person.firstName,
      fullName: entry.person.fullName,
      member: responder.label,
      hi: localHour < 12 ? "Bom dia" : localHour < 18 ? "Boa tarde" : "Boa noite",
      day: random.pick(weekdayNames),
    };

    // Walk the exchange, stopping at the first step that would be in the future.
    let at = start;
    let previous: Step["by"] | null = null;
    let ownedByTeam = false;
    let teamAnswered = false;
    let handoff: HandoffRow | null = null;
    let unanswered: MessageRow[] = [];
    const handOff = (
      reason: HandoffRow["reason"],
      actor: "bot" | "member",
      memberId: string | null,
    ) => {
      if (ownedByTeam) return;
      ownedByTeam = true;
      handoff = {
        id: uuid(at),
        tenantId,
        conversationId,
        reason,
        actor,
        memberId,
        occurredAt: new Date(at),
      };
      handoffs.push(handoff);
    };
    const push = (
      row: Omit<
        MessageRow,
        "id" | "tenantId" | "conversationId" | "sentAt" | "createdAt" | "wamid"
      >,
    ) => {
      const sent: MessageRow = {
        id: uuid(at),
        tenantId,
        conversationId,
        wamid: `wamid.SHOWCASE.${++wamids}`,
        sentAt: new Date(at),
        createdAt: new Date(at),
        ...row,
      };
      messages.push(sent);
      return sent;
    };

    for (const step of scenario.steps(context)) {
      if (step.by === "contact") {
        at +=
          previous === null
            ? 0
            : previous === "contact"
              ? random.integer(5, 40) * 1000
              : previous === "bot"
                ? random.integer(30, 360) * 1000
                : random.integer(60, 600) * 1000;
      } else if (step.by === "bot") {
        at += random.integer(3, 12) * 1000;
      } else {
        at += (teamAnswered ? random.integer(1, 5) : random.integer(2, 25)) * minute;
        at = openingAtOrAfter(at);
      }
      if (at > now) break;
      previous = step.by;

      if (step.by === "contact") {
        unanswered.push(
          push({ direction: "inbound", origin: "contact", type: "text", text: step.text }),
        );
      } else if (step.by === "bot") {
        const answered = unanswered.at(-1);
        if (!answered) throw new Error(`A Bot reply answers no Contact message: ${step.text}`);
        for (const row of unanswered) row.botAnswered = true;
        unanswered = [];
        push({
          direction: "outbound",
          origin: "bot",
          type: "text",
          text: step.text,
          answeredMessageId: answered.id,
          status: outboundStatus(at),
        });
        if (step.handoff) handOff(step.handoff, "bot", null);
      } else if (step.by === "claim") {
        handOff("claimed", "member", responder.id);
      } else if (step.by === "team") {
        handOff("dashboard_reply", "member", responder.id);
        teamAnswered = true;
        push({
          direction: "outbound",
          origin: "dashboard",
          type: "text",
          text: step.text,
          authorMemberId: responder.id,
          status: outboundStatus(at),
        });
      } else {
        handOff("app_reply", "member", null);
        teamAnswered = true;
        push({
          direction: "outbound",
          origin: "app",
          type: "text",
          text: step.text,
          status: outboundStatus(at),
        });
      }
    }

    if (previous === null) continue;
    entry.conversation.lastMessageAt = new Date(at);
    lastSession.set(conversationId, { handoff, teamAnswered, unanswered, endedAt: at });
  }
}

// The newest Handoffs nobody has closed yet are still with the team and on
// the waiting list, so the inbox always has a queue to show, whatever time
// the seed runs. Older ones were marked "Resolvida", which settles their backlog.
const stillWaiting = 4;
const waitingIds = new Set(
  conversations
    .filter(({ id }) => lastSession.get(id)?.handoff)
    .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime())
    .slice(0, stillWaiting)
    .map(({ id }) => id),
);
for (const row of conversations) {
  const session = lastSession.get(row.id);
  const handoff = session?.handoff;
  if (handoff && waitingIds.has(row.id)) {
    Object.assign(row, { owner: "team", waiting: true, handoffReason: handoff.reason });
  } else {
    for (const message of session?.unanswered ?? []) message.botAnswered = true;
  }
}

// This month's acknowledged Bot replies, for the reply meter.
const monthStart = Date.parse(`${saoPauloToday.slice(0, 8)}01T00:00:00Z`) + saoPauloOffset;
const repliesThisMonth = messages.filter(
  ({ origin, sentAt }) => origin === "bot" && sentAt.getTime() >= monthStart,
).length;

const inBatches = async <T>(rows: T[], insert: (batch: T[]) => Promise<unknown>) => {
  for (let index = 0; index < rows.length; index += 1000)
    await insert(rows.slice(index, index + 1000));
};
await db.transaction(async (tx) => {
  await inBatches(contacts, (batch) => tx.insert(contact).values(batch));
  await inBatches(conversations, (batch) => tx.insert(conversation).values(batch));
  await inBatches(messages, (batch) => tx.insert(message).values(batch));
  await inBatches(handoffs, (batch) => tx.insert(handoffEvent).values(batch));
  await tx.insert(botReplyUsage).values({
    tenantId,
    period: saoPauloToday.slice(0, 8) + "01",
    replies: repliesThisMonth,
  });
});

const waiting = conversations.filter(({ waiting }) => waiting).length;
console.log(
  [
    `Seeded Tenant "${clinic.name}": ${contacts.length} Contacts, ${messages.length} messages, ${handoffs.length} Handoffs, ${waiting} waiting for the team.`,
    `Sign in at ${env.APP_URL}/entrar as ${team.owner.local}@${clinic.emailDomain} / ${password}`,
  ].join("\n"),
);
process.exit(0);
