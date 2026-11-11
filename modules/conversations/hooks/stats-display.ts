import type { BusinessHours } from "@/modules/bot";
import {
  defaultStatsPeriod,
  statsPeriods,
  type ConversationStats,
  type StatsPeriod,
} from "@/modules/conversations/stats";

// The period selector's options, as kept in the URL.
export const statsPeriodOptions = statsPeriods.map((period) => ({
  period,
  value: String(period),
  label: `${period} dias`,
}));

export const parseStatsPeriod = (value: string): StatsPeriod =>
  statsPeriods.find((period) => String(period) === value) ?? defaultStatsPeriod;

// "Atendidas só pelo Bot" as a whole percentage, or null with no Active Conversations.
export const botOnlyShare = (stats: ConversationStats) =>
  stats.activeConversations === 0
    ? null
    : Math.round((stats.botOnlyConversations / stats.activeConversations) * 100);

const minutes = (time: string) => {
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + mins;
};

// For each hour of the day, how many weekdays the business is open for any
// part of it: the hour chart shades busier opening hours more strongly.
export const openWeekdaysByHour = (hours: BusinessHours) =>
  Array.from({ length: 24 }, (_, hour) =>
    Object.values(hours).filter(
      (day) =>
        day !== null && minutes(day.opens) < (hour + 1) * 60 && minutes(day.closes) > hour * 60,
    ),
  ).map((days) => days.length);

// Consecutive hours open on the same number of weekdays, for shading.
export const openHourBands = (hours: BusinessHours) =>
  openWeekdaysByHour(hours).reduce<{ from: number; to: number; days: number }[]>(
    (bands, days, hour) => {
      const last = bands.at(-1);
      if (days === 0) return bands;
      if (last && last.days === days && last.to === hour - 1) last.to = hour;
      else bands.push({ from: hour, to: hour, days });
      return bands;
    },
    [],
  );

const dayFromIso = (date: string) => new Date(`${date}T00:00:00Z`);

const shortDay = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "UTC",
});

const longDay = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

// "2026-11-11" → "11/11".
export const formatStatsDay = (date: string) => shortDay.format(dayFromIso(date));

// "2026-11-11" → "qua., 11 de nov.".
export const formatStatsDayLong = (date: string) => longDay.format(dayFromIso(date));

export const formatStatsHour = (hour: number) => `${hour}h`;

const relativeTime = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

// How long ago, in the largest whole unit: "há 12 minutos", "ontem".
export const formatTimeAgo = (at: Date, now: Date) => {
  const elapsed = Math.max(0, now.getTime() - at.getTime()) / 60_000;
  if (elapsed < 1) return "agora";
  if (elapsed < 60) return relativeTime.format(-Math.floor(elapsed), "minute");
  if (elapsed < 24 * 60) return relativeTime.format(-Math.floor(elapsed / 60), "hour");
  return relativeTime.format(-Math.floor(elapsed / (24 * 60)), "day");
};
