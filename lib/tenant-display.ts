const memberRoleLabels: Record<string, string> = {
  owner: "Responsável",
  admin: "Administrador(a)",
  member: "Membro",
};

export const memberRoleLabel = (role: string) => memberRoleLabels[role] ?? role;

const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export const formatDateTime = (date: Date) => dateTimeFormat.format(date);
