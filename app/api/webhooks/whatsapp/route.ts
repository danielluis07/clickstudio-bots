import { whatsAppWebhookRoute } from "@/server/services";

export const GET = (request: Request) => whatsAppWebhookRoute.GET(request);

export const POST = (request: Request) => whatsAppWebhookRoute.POST(request);
