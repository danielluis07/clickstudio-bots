import { waitUntil } from "@vercel/functions";
import { db } from "@/db";
import { createAuth } from "@/server/auth/create-auth";
import { env } from "@/platform/env";

export const auth = createAuth({
  db,
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  runInBackground: waitUntil,
});
