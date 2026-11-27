import { createHmac } from "node:crypto";
import { expect, test } from "bun:test";
import { createMercadoPagoWebhookRoute } from "@/server/mercado-pago-webhook";
import { createTestDiagnostics } from "@/test/support/diagnostics";

const secret = "webhook-secret";
const url = "https://bots.example.com/api/webhooks/mercado-pago";

// Signs as Mercado Pago does (the manifest is pinned by test/platform/mercado-pago.test.ts).
const sign = (dataId: string | null, requestId = "request-1", ts = "1764590400") => {
  const manifest = `${dataId ? `id:${dataId};` : ""}request-id:${requestId};ts:${ts};`;
  return `ts=${ts},v1=${createHmac("sha256", secret).update(manifest).digest("hex")}`;
};

const setup = (fail = false) => {
  const received: { type: string; id: string }[] = [];
  const diagnostics = createTestDiagnostics();
  const route = createMercadoPagoWebhookRoute({
    billing: {
      async receiveNotification(notification) {
        if (fail) throw new Error("Mercado Pago unavailable");
        received.push(notification);
      },
    },
    secret,
    diagnostics,
  });
  return { route, received, diagnostics };
};

const notify = (
  route: ReturnType<typeof createMercadoPagoWebhookRoute>,
  { query = "", body = {}, signature }: { query?: string; body?: object; signature: string | null },
) =>
  route.POST(
    new Request(`${url}${query}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "request-1",
        ...(signature ? { "x-signature": signature } : {}),
      },
      body: JSON.stringify(body),
    }),
  );

test("a signed notification is handed to billing by its type and resource id", async () => {
  const { route, received } = setup();
  const response = await notify(route, {
    query: "?data.id=123456&type=payment",
    body: { type: "payment", action: "payment.created", data: { id: "123456" } },
    signature: sign("123456"),
  });
  expect(response.status).toBe(200);
  expect(received).toEqual([{ type: "payment", id: "123456" }]);
});

test("a bad or missing signature is rejected before billing sees it", async () => {
  const { route, received } = setup();
  const body = { type: "payment", data: { id: "123456" } };
  expect(
    (await notify(route, { query: "?data.id=123456", body, signature: sign("999") })).status,
  ).toBe(401);
  expect((await notify(route, { query: "?data.id=123456", body, signature: null })).status).toBe(
    401,
  );
  // Signed for one id, sent for another.
  expect(
    (
      await notify(route, {
        query: "?data.id=654321",
        body: { ...body, data: { id: "654321" } },
        signature: sign("123456"),
      })
    ).status,
  ).toBe(401);
  expect(received).toEqual([]);
});

test("the id comes from data.id in the query, then the body, then a legacy ?id=", async () => {
  const { route, received } = setup();
  await notify(route, {
    body: { type: "subscription_preapproval", data: { id: "2c9380847e9b" } },
    signature: sign("2c9380847e9b"),
  });
  await notify(route, {
    query: "?id=987&topic=payment",
    signature: sign("987"),
  });
  expect(received).toEqual([
    { type: "subscription_preapproval", id: "2c9380847e9b" },
    { type: "payment", id: "987" },
  ]);
});

test("a signed notification without a resource is acknowledged and ignored", async () => {
  const { route, received } = setup();
  expect((await notify(route, { body: { type: "payment" }, signature: sign(null) })).status).toBe(
    200,
  );
  expect(received).toEqual([]);
});

test("a failure answers 500 so Mercado Pago retries, and is reported", async () => {
  const { route, diagnostics } = setup(true);
  const response = await notify(route, {
    query: "?data.id=123456&type=payment",
    signature: sign("123456"),
  });
  expect(response.status).toBe(500);
  expect(diagnostics.alerts.map(({ kind }) => kind)).toEqual(["billing_notification_failed"]);
});

test("without Mercado Pago configured, notifications are refused", async () => {
  const route = createMercadoPagoWebhookRoute({ billing: null, secret: null });
  const response = await notify(route, { query: "?data.id=1", signature: sign("1") });
  expect(response.status).toBe(503);
});
