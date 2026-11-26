import { mercadoPagoWebhookRoute } from "@/server/services";

export const POST = (request: Request) => mercadoPagoWebhookRoute.POST(request);
