const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export const formatDateTime = (date: Date) => dateTimeFormat.format(date);

const shortDateTimeFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export const formatShortDateTime = (date: Date) => shortDateTimeFormat.format(date);

const timeFormat = new Intl.DateTimeFormat("pt-BR", {
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});
const dayMonthFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "America/Sao_Paulo",
});
const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });

// For a list row: "14:32" today, "Ontem" yesterday, "22/11" before that,
// counting São Paulo days.
export const formatListTime = (date: Date, now: Date) => {
  const day = dayFormat.format(date);
  if (day === dayFormat.format(now)) return timeFormat.format(date);
  if (day === dayFormat.format(new Date(now.getTime() - 86_400_000))) return "Ontem";
  return dayMonthFormat.format(date);
};

const countFormat = new Intl.NumberFormat("pt-BR");

// 30000 → "30.000".
export const formatCount = (count: number) => countFormat.format(count);
