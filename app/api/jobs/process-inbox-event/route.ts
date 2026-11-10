import { inboxJobRoute } from "@/server/services";

export const maxDuration = 30;

export const POST = (request: Request) => inboxJobRoute.POST(request);
