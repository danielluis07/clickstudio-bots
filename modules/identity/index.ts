// People who can sign in, and the platform administrator role.
export { createPlatformAdmin, isPlatformAdmin } from "@/modules/identity/platform-admin";
export { createUserRepository } from "@/modules/identity/users";
export {
  createSignInThrottle,
  pruneSignInAttempts,
  signInAttemptLimits,
  type SignInThrottle,
} from "@/modules/identity/sign-in-throttle";
