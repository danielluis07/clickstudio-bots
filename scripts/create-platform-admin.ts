import { db } from "@/db";
import { createPlatformAdmin } from "@/modules/identity";

// Usage: ADMIN_PASSWORD=... bun run admin:create <email> <name>
const [email, ...nameParts] = process.argv.slice(2);
const name = nameParts.join(" ");
const password = process.env.ADMIN_PASSWORD;

if (!email || !name || !password || password.length < 8) {
  console.error(
    "Usage: ADMIN_PASSWORD=<at least 8 characters> bun run admin:create <email> <name>",
  );
  process.exit(1);
}

const admin = await createPlatformAdmin(db, { email, name, password });
console.log(`Created platform administrator ${admin.id}`);
process.exit(0);
