import "server-only";
import { db } from "@/db";
import { auth } from "@/server/auth/auth";
import {
  billing,
  botActivation,
  botAllowance,
  botSandbox,
  channelService,
  contactDeletion,
  conversationRepository,
  conversationStats,
  handoffControls,
  memberAlertPreferences,
  memberAlerts,
  memberTour,
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
  alerts: memberAlerts,
  alertPreferences: memberAlertPreferences,
  tenants: tenantRepository,
  tour: memberTour,
  channels: channelService,
  billing,
  signupConfig: getWhatsAppSignupConfig,
  session: session
    ? { userId: session.user.id, activeTenantId: session.session.activeOrganizationId ?? null }
    : null,
});

export const createTRPCContext = async (headers: Headers) =>
  contextForSession(await auth.api.getSession({ headers }));
