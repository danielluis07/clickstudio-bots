import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { env } from "@/platform/env";

export default defineConfig({
  out: "./drizzle",
  schema: "./db/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    // Migrations run as the schema owner role on the direct endpoint. The app's own
    // role cannot change the schema (#148). CI sets DATABASE_URL to the owner's
    // direct string instead (ADR 0009).
    url: process.env.DATABASE_MIGRATION_URL || env.DATABASE_URL,
  },
});
