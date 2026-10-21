import { inboxFailureRoute } from "@/server/services";

export const POST = (request: Request) => inboxFailureRoute.POST(request);
