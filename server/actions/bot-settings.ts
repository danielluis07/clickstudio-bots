"use server";

import { refresh } from "next/cache";
import { botSettingsLimits, weekdays, type BehaviourSettings } from "@/modules/bot";
import { formText, type FormState } from "@/server/actions/form-state";
import { requireTenantScope } from "@/server/auth/guards";
import { botSettingsEditor } from "@/server/services";

// The bot module re-checks that the actor is the Tenant's owner and that
// every setting is within its bounds.

const saveErrorMessages = {
  forbidden: "Apenas o responsável pelo negócio pode alterar as configurações do Bot.",
  invalid: `Confira os campos: o nome do negócio é obrigatório, cada lista aceita até ${botSettingsLimits.topics} temas de até ${botSettingsLimits.topic} caracteres, cada dia aberto precisa abrir antes de fechar e “Somente fora do horário de funcionamento” exige ao menos um dia aberto.`,
} as const;

// One topic per line.
const formTopics = (formData: FormData, name: string) => formText(formData, name).split("\n");

// A day the owner did not mark as open is closed, whatever times it holds.
const formHours = (formData: FormData) =>
  Object.fromEntries(
    weekdays.map((day) => [
      day,
      formData.has(`${day}.open`)
        ? { opens: formText(formData, `${day}.opens`), closes: formText(formData, `${day}.closes`) }
        : null,
    ]),
  ) as BehaviourSettings["hours"];

export async function saveBotSettingsAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const scope = await requireTenantScope();
  const result = await botSettingsEditor.saveSettings(scope, {
    businessName: formText(formData, "businessName"),
    offer: formText(formData, "offer"),
    address: formText(formData, "address"),
    hours: formHours(formData),
    // The module refuses any other tone or schedule.
    tone: formText(formData, "tone") as BehaviourSettings["tone"],
    emoji: formData.has("emoji"),
    greeting: formText(formData, "greeting"),
    rules: formText(formData, "rules"),
    refusedTopics: formTopics(formData, "refusedTopics"),
    handoffTopics: formTopics(formData, "handoffTopics"),
    schedule: formText(formData, "schedule") as BehaviourSettings["schedule"],
  });
  if (!result.ok) return { status: "error", message: saveErrorMessages[result.error] };
  refresh();
  return {
    status: "success",
    message: "Salvo. O Bot já usa estas configurações na próxima resposta.",
  };
}
