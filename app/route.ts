import { redirectFromRoot } from "@/server/auth/root-redirect";

export const GET = (request: Request) => redirectFromRoot(request);
