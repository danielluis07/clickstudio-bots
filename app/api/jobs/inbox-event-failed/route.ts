import { inboxFailureRoute } from "@/server/services";

export const maxDuration = 30;

export const POST = (request: Request) => inboxFailureRoute.POST(request);
