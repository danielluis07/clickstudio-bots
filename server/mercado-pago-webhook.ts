import { z } from "zod";
import type { Billing } from "@/modules/billing";
import { reportError, type Diagnostics } from "@/platform/diagnostics";
import { verifyMercadoPagoSignature } from "@/platform/mercado-pago";

const empty = (status: number) => new Response(null, { status });

// Only what routing needs; the resource itself is fetched from Mercado Pago.
const notificationSchema = z
  .object({
    type: z.string().optional().catch(undefined),
    data: z
      .object({ id: z.union([z.string(), z.number()]).optional() })
      .optional()
      .catch(undefined),
  })
  .catch({});

const parseJson = (body: string): unknown => {
  try {
    return JSON.parse(body);
  } catch {
    // A notification may come without a body; the query string still names it.
    return null;
  }
};

const resourceIdPattern = /^[A-Za-z0-9_-]{1,64}$/;

// Mercado Pago's webhooks for `subscription_preapproval`,
// `subscription_authorized_payment` and `payment` (ADR 0012). The signed id
// is `data.id` from the query string, else from the body, else the `?id=` of
// legacy notifications; the same id is the one billing fetches. Anything but
// 200 or 201 makes Mercado Pago retry (every 15 minutes, then less often),
// which recovers a failed fetch.
export const createMercadoPagoWebhookRoute = ({
  billing,
  secret,
  diagnostics,
}: {
  billing: Pick<Billing, "receiveNotification"> | null;
  secret: string | null;
  diagnostics?: Diagnostics;
}) => ({
  async POST(request: Request) {
    if (!billing || !secret) return empty(503);
    const query = new URL(request.url).searchParams;
    const body = notificationSchema.parse(parseJson(await request.text()));
    const bodyId = body.data?.id === undefined ? null : String(body.data.id);
    const id = query.get("data.id") ?? bodyId ?? query.get("id");
    const verified = verifyMercadoPagoSignature({
      signature: request.headers.get("x-signature"),
      requestId: request.headers.get("x-request-id"),
      dataId: id,
      secret,
    });
    if (!verified) return empty(401);

    const type = body.type ?? query.get("type") ?? query.get("topic");
    if (!id || !type) return empty(200);
    if (!resourceIdPattern.test(id)) return empty(400);
    try {
      await billing.receiveNotification({ type, id });
      return empty(200);
    } catch (error) {
      await reportError(diagnostics, "billing_notification_failed", error);
      return empty(500);
    }
  },
});
