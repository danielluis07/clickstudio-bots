// Tenants and their Members: creating a Tenant and inviting its owner,
// accepting invitations, the owner inviting and removing Members, and the
// TenantScope that every query on Tenant-owned data requires.
export { invitationLifetimeDays } from "@/modules/tenancy/invitations";
export { memberRoleLabel } from "@/modules/tenancy/labels";
export {
  createMemberManagement,
  memberAllowance,
  type NewMemberInvitation,
} from "@/modules/tenancy/members";
export {
  createTenantOnboarding,
  type InvitationAcceptance,
  type NewTenant,
} from "@/modules/tenancy/onboarding";
export { createTenantRepository } from "@/modules/tenancy/repository";
export { resolveTenantScope, type TenantScope } from "@/modules/tenancy/scope";
