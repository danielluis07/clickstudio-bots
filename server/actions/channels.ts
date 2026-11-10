"use server";

import { refresh } from "next/cache";
import type { ChannelSignup } from "@/modules/channels";
import type { FormState } from "@/server/actions/form-state";
import { requireTenantScope } from "@/server/auth/guards";
import { channelService } from "@/server/services";

const connectErrors = {
  forbidden: "Apenas o responsável pelo negócio pode conectar o Canal.",
  invalid: "Não foi possível validar a conexão. Inicie novamente pelo botão abaixo.",
  already_connected: "Este negócio já possui um Canal conectado.",
  channel_conflict:
    "O Canal já está conectado. Atualize a página ou entre em contato com o suporte.",
  signup_failed:
    "Não foi possível concluir a conexão com a Meta. Verifique as permissões e tente novamente.",
  different_number:
    "Selecione na Meta o mesmo número de WhatsApp Business que estava conectado. Para trocar de número, entre em contato com o suporte.",
} as const;

export async function connectWhatsAppAction(input: ChannelSignup): Promise<FormState> {
  const scope = await requireTenantScope();
  const result = await channelService.connect(scope, input);
  if (!result.ok) return { status: "error", message: connectErrors[result.error] };
  refresh();
  return {
    status: "success",
    message: result.reconnected
      ? "Canal reconectado. O Bot volta a responder se estiver ligado."
      : "Canal conectado. O Bot continua desligado.",
  };
}

export async function retryWhatsAppSubscriptionAction(): Promise<FormState> {
  const scope = await requireTenantScope();
  const result = await channelService.retrySubscription(scope);
  if (!result.ok)
    return {
      status: "error",
      message:
        result.error === "forbidden"
          ? "Apenas o responsável pelo negócio pode tentar novamente."
          : "Nenhum Canal conectado foi encontrado.",
    };
  refresh();
  const connected = await channelService.getChannel(scope);
  return connected?.subscriptionStatus === "subscribed"
    ? {
        status: "success",
        message: "Recebimento de eventos do WhatsApp confirmado. O Bot continua desligado.",
      }
    : {
        status: "error",
        message:
          "Não foi possível confirmar o recebimento de eventos. Tente novamente ou entre em contato com o suporte.",
      };
}
