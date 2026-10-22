import type { CaptureMode, CaptureSettings } from "@/modules/bot/capture";
import type { BehaviourSettings } from "@/modules/bot/repository";
import { weekdays, type BotSchedule, type Weekday } from "@/modules/bot/schedule";

// What the settings form calls each option, in the order it offers them.

export const toneOptions: { value: BehaviourSettings["tone"]; label: string }[] = [
  { value: "formal", label: "Formal" },
  { value: "neutral", label: "Neutro" },
  { value: "casual", label: "Descontraído" },
];

export const scheduleOptions: { value: BotSchedule; label: string }[] = [
  { value: "always", label: "Sempre ativo" },
  { value: "outside_business_hours", label: "Somente fora do horário de funcionamento" },
];

export const captureModeOptions: { value: CaptureMode; label: string }[] = [
  { value: "off", label: "Não capturar" },
  { value: "optional", label: "Opcional" },
  { value: "required", label: "Pedir uma vez antes de chamar a equipe" },
];

export const captureFieldOptions: {
  field: keyof CaptureSettings["fields"];
  label: string;
  description: string;
}[] = [
  { field: "name", label: "Nome", description: "O nome que o contato informar." },
  { field: "email", label: "E-mail", description: "Um endereço de e-mail válido." },
  { field: "city", label: "Cidade", description: "Onde o contato está." },
  {
    field: "need",
    label: "Necessidade",
    description: "Em poucas palavras, o que o contato precisa.",
  },
];

const weekdayLabels: Record<Weekday, string> = {
  monday: "Segunda-feira",
  tuesday: "Terça-feira",
  wednesday: "Quarta-feira",
  thursday: "Quinta-feira",
  friday: "Sexta-feira",
  saturday: "Sábado",
  sunday: "Domingo",
};

export const weekdayOptions = weekdays.map((day) => ({ day, label: weekdayLabels[day] }));

// Shown when the Member who last saved the settings has been removed.
export const settingsEditorLabel = (updatedBy: string | null) => updatedBy ?? "Membro removido";
