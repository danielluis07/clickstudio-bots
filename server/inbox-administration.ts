import { z } from "zod";
import type { WebhookInbox } from "@/modules/webhook-inbox";
import { formText, type FormState } from "@/server/actions/form-state";

type AdminGuard = () => Promise<{ user: { id: string } }>;

export const inboxFailurePage = (page: unknown) => {
  const parsed = z.coerce.number().int().min(1).max(20_000).safeParse(page);
  return parsed.success ? parsed.data : 1;
};

export const createReplayInboxAction = ({ inbox, requireAdmin }: {
  inbox: WebhookInbox | null;
  requireAdmin: AdminGuard;
}) => async (_previous: FormState, formData: FormData): Promise<FormState> => {
  const { user } = await requireAdmin();
  const id = z.uuid().safeParse(formText(formData, "inboxEventId"));
  if (!id.success) return { status: "error", message: "Evento inválido." };
  if (!inbox) return { status: "error", message: "O processamento de eventos não está configurado." };
  try {
    const result = await inbox.replay(user.id, id.data);
    if (!result.ok) return {
      status: "error",
      message: result.error === "forbidden" ? "Você não tem permissão para reprocessar eventos." : "O evento não está mais disponível.",
    };
    return { status: "success", message: result.status === "ignored" ? "Evento ignorado: canal desconhecido ou tipo sem suporte." : "Evento reprocessado." };
  } catch {
    return { status: "error", message: "Não foi possível reprocessar o evento. Tente novamente após corrigir a falha." };
  }
};
