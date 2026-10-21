"use client";

import { createAuthClient } from "better-auth/react";

const authClient = createAuthClient();

export const useSession = authClient.useSession;
