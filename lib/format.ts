const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export const formatDateTime = (date: Date) => dateTimeFormat.format(date);
