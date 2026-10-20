import { handleTRPCRequest } from "@/trpc/handler";

export const GET = (request: Request) => handleTRPCRequest(request);

export const POST = (request: Request) => handleTRPCRequest(request);
