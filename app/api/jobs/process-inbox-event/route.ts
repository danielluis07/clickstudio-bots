import { inboxJobRoute } from "@/server/services";

export const POST = (request: Request) => inboxJobRoute.POST(request);
