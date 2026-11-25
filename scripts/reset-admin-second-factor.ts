import { db } from "@/db";
import { resetPlatformAdminSecondFactor } from "@/modules/identity";

// Usage: bun run admin:reset-second-factor <email>
// For an administrator who lost the authenticator app and the backup codes.
const [email] = process.argv.slice(2);

if (!email) {
  console.error("Usage: bun run admin:reset-second-factor <email>");
  process.exit(1);
}

if (!(await resetPlatformAdminSecondFactor(db, email))) {
  console.error("No platform administrator has that email.");
  process.exit(1);
}
console.log("Second factor removed and sessions ended. Set up a new one at the next sign-in.");
process.exit(0);
