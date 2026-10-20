import { db } from "@/db";
import { createAuth } from "@/lib/create-auth";
import { env } from "@/lib/env";

export const auth = createAuth({
  db,
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
});
