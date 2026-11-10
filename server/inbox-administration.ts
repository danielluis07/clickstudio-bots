import { z } from "zod";
import type { WebhookInbox } from "@/modules/webhook-inbox";
import { formText, type FormState } from "@/server/actions/form-state";

type AdminGuard = () => Promise<{ user: { id: string } }>;

export const inboxFailurePage = (page: unknown) => {
  const parsed = z.coerce.number().int().min(1).max(20_000).safeParse(page);
  return parsed.success ? parsed.data : 1;
};

export const createReplayInboxAction =
  ({ inbox, requireAdmin }: { inbox: WebhookInbox | null; requireAdmin: AdminGuard }) =>
  async (_previous: FormState, formData: FormData): Promise<FormState> => {
    const { user } = await requireAdmin();
    const id = z.uuid().safeParse(formText(formData, "inboxEventId"));
    if (!id.success) return { status: "error", message: "Evento inválido." };
    if (!inbox)
      return { status: "error", message: "O processamento de eventos não está configurado." };
    try {
      const result = await inbox.replay(user.id, id.data);
      if (!result.ok)
        return {
          status: "error",
          message:
            result.error === "forbidden"
              ? "Você não tem permissão para reprocessar eventos."
              : "O evento não está mais disponível.",
        };
      return {
        status: "success",
        message:
          result.status === "ignored"
            ? "Evento ignorado: canal desconhecido ou tipo sem suporte."
            : "Evento reprocessado.",
      };
    } catch {
      return {
        status: "error",
        message: "Não foi possível reprocessar o evento. Tente novamente após corrigir a falha.",
      };
    }
  };

// One page of the failures list at most; a larger request is not the page.
const pageEventIds = z.array(z.uuid()).min(1).max(50);

const requeuedMessage = (requeued: number) =>
  requeued === 0
    ? "Nenhum evento com falha para reprocessar."
    : requeued === 1
      ? "1 evento enviado para reprocessamento. Atualize em instantes."
      : `${requeued} eventos enviados para reprocessamento. Atualize em instantes.`;

// Bulk replay: the events listed on the page (`scope=page`, with their ids)
// or every listed failure (`scope=all`). Takes no Tenant id or payload.
export const createReplayFailuresAction =
  ({ inbox, requireAdmin }: { inbox: WebhookInbox | null; requireAdmin: AdminGuard }) =>
  async (_previous: FormState, formData: FormData): Promise<FormState> => {
    const { user } = await requireAdmin();
    const scope = formText(formData, "scope");
    const ids = scope === "page" ? pageEventIds.safeParse(formData.getAll("inboxEventId")) : null;
    if (scope !== "all" && !ids?.success) return { status: "error", message: "Eventos inválidos." };
    if (!inbox)
      return { status: "error", message: "O processamento de eventos não está configurado." };
    try {
      const result = await inbox.replayFailures(user.id, ids?.data);
      if (!result.ok)
        return { status: "error", message: "Você não tem permissão para reprocessar eventos." };
      return { status: "success", message: requeuedMessage(result.requeued) };
    } catch {
      return {
        status: "error",
        message:
          "Não foi possível enviar todos os eventos para reprocessamento. Tente novamente após corrigir a falha.",
      };
    }
  };
