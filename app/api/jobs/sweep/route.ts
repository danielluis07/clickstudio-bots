import { sweepRoute } from "@/server/services";

export const maxDuration = 60;

export const POST = (request: Request) => sweepRoute.POST(request);
