const memberRoleLabels: Record<string, string> = {
  owner: "Responsável",
  admin: "Administrador(a)",
  member: "Membro",
};

export const memberRoleLabel = (role: string) => memberRoleLabels[role] ?? role;
