import "server-only";
import { db } from "@/db";
import { auth } from "@/server/auth/auth";
import {
  botActivation,
  botAllowance,
  botSandbox,
  channelService,
  contactDeletion,
  conversationRepository,
  conversationStats,
  handoffControls,
  notifier,
  realtime,
  replyService,
  tenantRepository,
} from "@/server/services";
import { getWhatsAppSignupConfig } from "@/server/whatsapp";
import type { TRPCContext } from "@/trpc/init";

type Session = Awaited<ReturnType<typeof auth.api.getSession>>;

export const contextForSession = (session: Session): TRPCContext => ({
  db,
  replies: replyService,
  realtime,
  notifier,
  sandbox: botSandbox,
  allowance: botAllowance,
  activation: botActivation,
  handoff: handoffControls,
  deleteContact: contactDeletion,
  conversationStats,
  conversations: conversationRepository,
  tenants: tenantRepository,
  channels: channelService,
  signupConfig: getWhatsAppSignupConfig,
  session: session
    ? { userId: session.user.id, activeTenantId: session.session.activeOrganizationId ?? null }
    : null,
});

export const createTRPCContext = async (headers: Headers) =>
  contextForSession(await auth.api.getSession({ headers }));
