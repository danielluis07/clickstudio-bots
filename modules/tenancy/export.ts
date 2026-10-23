import { asc, eq } from "drizzle-orm";
import type { Database } from "@/db/database";
import {
  botActivation,
  botCaptureSettings,
  botLinkSettings,
  botReplyUsage,
  botSandboxUsage,
  botSettings,
  channel,
  contact,
  conversation,
  invitation,
  knowledgeBaseEntry,
  legalAcceptance,
  member,
  message,
  messageChange,
  organization,
  user,
} from "@/db/schema";
import { isPlatformAdmin } from "@/modules/identity";
import type { Clock } from "@/platform/clock";
import { exportCsv } from "@/modules/tenancy/export-csv";

export type TenantExportFile = { filename: string; content: string };

// Administrator-only portability snapshot. Explicit projections keep auth
// secrets, encrypted Meta tokens and operational leases out of delivered files.
export const createTenantExport = ({ db, clock }: { db: Database; clock: Clock }) => ({
  async export(actorId: string, tenantId: string, format: "json" | "csv") {
    if (!(await isPlatformAdmin(db, actorId)))
      return { ok: false as const, error: "forbidden" as const };
    if (format !== "json" && format !== "csv")
      return { ok: false as const, error: "invalid_format" as const };
    const data = await db.transaction(
      async (tx) => {
        const [tenant] = await tx
          .select({
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
            logo: organization.logo,
            metadata: organization.metadata,
            canceledAt: organization.canceledAt,
            createdAt: organization.createdAt,
            updatedAt: organization.updatedAt,
          })
          .from(organization)
          .where(eq(organization.id, tenantId));
        if (!tenant) return null;
        const [
          members,
          invitations,
          legalAcceptances,
          channels,
          contacts,
          conversations,
          messages,
          messageChanges,
          knowledgeBase,
          behaviourSettings,
          captureSettings,
          linkSettings,
          sandboxUsage,
          replyUsage,
          activation,
        ] = [
          await tx
            .select({
              id: member.id,
              userId: user.id,
              name: user.name,
              email: user.email,
              role: member.role,
              createdAt: member.createdAt,
            })
            .from(member)
            .innerJoin(user, eq(user.id, member.userId))
            .where(eq(member.organizationId, tenantId))
            .orderBy(asc(member.id)),
          await tx
            .select()
            .from(invitation)
            .where(eq(invitation.organizationId, tenantId))
            .orderBy(asc(invitation.id)),
          await tx
            .select()
            .from(legalAcceptance)
            .where(eq(legalAcceptance.tenantId, tenantId))
            .orderBy(asc(legalAcceptance.id)),
          await tx
            .select({
              id: channel.id,
              tenantId: channel.tenantId,
              wabaId: channel.wabaId,
              phoneNumberId: channel.phoneNumberId,
              displayPhoneNumber: channel.displayPhoneNumber,
              botEnabled: channel.botEnabled,
              botPaused: channel.botPaused,
              subscriptionStatus: channel.subscriptionStatus,
              createdAt: channel.createdAt,
            })
            .from(channel)
            .where(eq(channel.tenantId, tenantId)),
          await tx
            .select()
            .from(contact)
            .where(eq(contact.tenantId, tenantId))
            .orderBy(asc(contact.id)),
          await tx
            .select({
              id: conversation.id,
              tenantId: conversation.tenantId,
              channelId: conversation.channelId,
              contactId: conversation.contactId,
              owner: conversation.owner,
              handoffReason: conversation.handoffReason,
              waiting: conversation.waiting,
              lastMessageAt: conversation.lastMessageAt,
              createdAt: conversation.createdAt,
              updatedAt: conversation.updatedAt,
            })
            .from(conversation)
            .where(eq(conversation.tenantId, tenantId))
            .orderBy(asc(conversation.id)),
          await tx
            .select()
            .from(message)
            .where(eq(message.tenantId, tenantId))
            .orderBy(asc(message.id)),
          await tx
            .select()
            .from(messageChange)
            .where(eq(messageChange.tenantId, tenantId))
            .orderBy(asc(messageChange.id)),
          await tx
            .select()
            .from(knowledgeBaseEntry)
            .where(eq(knowledgeBaseEntry.tenantId, tenantId))
            .orderBy(asc(knowledgeBaseEntry.id)),
          await tx.select().from(botSettings).where(eq(botSettings.tenantId, tenantId)),
          await tx
            .select()
            .from(botCaptureSettings)
            .where(eq(botCaptureSettings.tenantId, tenantId)),
          await tx.select().from(botLinkSettings).where(eq(botLinkSettings.tenantId, tenantId)),
          await tx.select().from(botSandboxUsage).where(eq(botSandboxUsage.tenantId, tenantId)),
          await tx
            .select({
              tenantId: botReplyUsage.tenantId,
              period: botReplyUsage.period,
              replies: botReplyUsage.replies,
              warningSentAt: botReplyUsage.warningSentAt,
            })
            .from(botReplyUsage)
            .where(eq(botReplyUsage.tenantId, tenantId))
            .orderBy(asc(botReplyUsage.period)),
          await tx.select().from(botActivation).where(eq(botActivation.tenantId, tenantId)),
        ];
        return {
          version: 1,
          exportedAt: clock.now(),
          tenant,
          members,
          invitations,
          legalAcceptances,
          channels,
          contacts,
          conversations,
          messages,
          messageChanges,
          knowledgeBase,
          behaviourSettings,
          captureSettings,
          linkSettings,
          sandboxUsage,
          replyUsage,
          activation,
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
    if (!data) return { ok: false as const, error: "not_found" as const };
    const { version, exportedAt, tenant, ...tables } = data;
    const files: TenantExportFile[] =
      format === "json"
        ? [{ filename: "tenant.json", content: `${JSON.stringify(data, null, 2)}\n` }]
        : [
            { filename: "manifest.csv", content: exportCsv([{ version, exportedAt, tenantId }]) },
            { filename: "tenant.csv", content: exportCsv([tenant]) },
            ...Object.entries(tables).map(([name, rows]) => ({
              filename: `${name}.csv`,
              content: exportCsv(rows),
            })),
          ];
    return { ok: true as const, files };
  },
});
