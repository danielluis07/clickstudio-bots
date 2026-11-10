import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { env } from "@/platform/env";

export default defineConfig({
  out: "./drizzle",
  schema: "./db/schema/index.ts",
  dialect: "postgresql",
  // Migrations run as the owner role; the app's DATABASE_URL cannot change the
  // schema (ADR 0009). The fallback keeps a single-role database working.
  dbCredentials: {
    url: process.env.DATABASE_OWNER_URL || env.DATABASE_URL,
  },
});
