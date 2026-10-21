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

const countFormat = new Intl.NumberFormat("pt-BR");

// 30000 → "30.000".
export const formatCount = (count: number) => countFormat.format(count);
