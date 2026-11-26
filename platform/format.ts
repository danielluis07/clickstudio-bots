import { businessTimeZone, dayMs, localDay } from "@/platform/time";

const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: businessTimeZone,
});

export const formatDateTime = (date: Date) => dateTimeFormat.format(date);

const shortDateTimeFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: businessTimeZone,
});

export const formatShortDateTime = (date: Date) => shortDateTimeFormat.format(date);

const shortDateFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: businessTimeZone,
});

// "20/01/2027": the last São Paulo day before `end`, the day a deadline such
// as a Trial end still covers. The inverse of `endOfLocalDate`.
export const formatLastDay = (end: Date) => shortDateFormat.format(new Date(end.getTime() - 1));

const timeFormat = new Intl.DateTimeFormat("pt-BR", {
  timeStyle: "short",
  timeZone: businessTimeZone,
});
const dayMonthFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: businessTimeZone,
});

// For a list row: "14:32" today, "Ontem" yesterday, "22/11" before that,
// counting São Paulo days.
export const formatListTime = (date: Date, now: Date) => {
  const day = localDay(date);
  if (day === localDay(now)) return timeFormat.format(date);
  if (day === localDay(new Date(now.getTime() - dayMs))) return "Ontem";
  return dayMonthFormat.format(date);
};

const countFormat = new Intl.NumberFormat("pt-BR");

// 30000 → "30.000".
export const formatCount = (count: number) => countFormat.format(count);
