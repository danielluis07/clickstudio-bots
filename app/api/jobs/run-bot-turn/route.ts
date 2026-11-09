import { botJobRoute } from "@/server/services";

// Shorter than the two-minute Bot lease, so a turn never outlives its lease.
export const maxDuration = 60;

export const POST = (request: Request) => botJobRoute.POST(request);
