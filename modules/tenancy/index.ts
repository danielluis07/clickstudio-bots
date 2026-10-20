// Tenants and their Members: creating a Tenant and inviting its owner,
// accepting the invitation, and the TenantScope that every query on
// Tenant-owned data requires.
export { memberRoleLabel } from "@/modules/tenancy/labels";
export {
  createTenantOnboarding,
  invitationLifetimeDays,
  type InvitationAcceptance,
  type NewTenant,
} from "@/modules/tenancy/onboarding";
export { createTenantRepository } from "@/modules/tenancy/repository";
export { resolveTenantScope, type TenantScope } from "@/modules/tenancy/scope";
