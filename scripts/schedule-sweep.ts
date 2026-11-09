import { env } from "@/platform/env";
import { scheduleSweep } from "@/platform/qstash";

// Usage: bun run sweep:schedule
// Creates or updates the QStash schedule that calls APP_URL's sweep every five
// minutes (ADR 0007). Safe to run again after APP_URL or QSTASH_URL changes.
if (!env.QSTASH_TOKEN) {
  console.error("QSTASH_TOKEN is required to schedule the sweep.");
  process.exit(1);
}

const { scheduleId } = await scheduleSweep({
  token: env.QSTASH_TOKEN,
  baseUrl: env.QSTASH_URL,
  appUrl: env.APP_URL,
});
console.log(`Sweep schedule ${scheduleId} calls ${new URL("/api/jobs/sweep", env.APP_URL)}`);
process.exit(0);
