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
