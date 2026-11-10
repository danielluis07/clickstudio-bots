import type { MemberRole } from "@/modules/tenancy/scope";

const memberRoleLabels: Record<MemberRole, string> = {
  owner: "Responsável",
  admin: "Administrador(a)",
  member: "Membro",
};

export const memberRoleLabel = (role: MemberRole) => memberRoleLabels[role];
