import { env } from "@/platform/env";
import { isLocalUrl, scheduleSweep } from "@/platform/qstash";

// Usage: bun run sweep:schedule, with the target environment's APP_URL,
// QSTASH_TOKEN and QSTASH_URL (see docs/inbox-operations.md#the-sweep).
// Creates or updates the QStash schedule that calls APP_URL's sweep every five
// minutes (ADR 0007). Safe to run again after APP_URL or QSTASH_URL changes.
if (!env.QSTASH_TOKEN) {
  console.error("QSTASH_TOKEN is required to schedule the sweep.");
  process.exit(1);
}

// QStash's cloud refuses a destination it cannot reach, such as the local
// `.env`'s APP_URL.
if (isLocalUrl(env.APP_URL) && !isLocalUrl(env.QSTASH_URL)) {
  console.error(
    `APP_URL is ${env.APP_URL}, which QStash cannot reach. Run this with the deployed ` +
      "environment's APP_URL and QSTASH_TOKEN; see docs/inbox-operations.md#the-sweep.",
  );
  process.exit(1);
}

const { scheduleId } = await scheduleSweep({
  token: env.QSTASH_TOKEN,
  baseUrl: env.QSTASH_URL,
  appUrl: env.APP_URL,
});
console.log(`Sweep schedule ${scheduleId} calls ${new URL("/api/jobs/sweep", env.APP_URL)}`);
process.exit(0);
