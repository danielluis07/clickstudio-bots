import { dailyCronRoute } from "@/server/services";

export const GET = (request: Request) => dailyCronRoute.GET(request);
