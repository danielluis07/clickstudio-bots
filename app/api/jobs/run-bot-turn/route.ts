import { botJobRoute } from "@/server/services";

export const POST = (request: Request) => botJobRoute.POST(request);
