import { describe, expect, test } from "bun:test";
import {
  createMercadoPagoGateway,
  MercadoPagoRequestError,
  verifyMercadoPagoSignature,
} from "@/platform/mercado-pago";

type Request = { url: string; method: string; headers: unknown; body: unknown };

const preapproval = {
  id: "2c938084726fca480172750000000000",
  status: "authorized",
  payer_email: "dona@sorriso.example",
  external_reference: "tenant",
  auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: 99.9 },
  next_payment_date: "2027-01-01T12:00:00.000-03:00",
  last_modified: "2026-12-01T09:00:00.000-03:00",
};

const gatewayAnswering = (respond: (request: Request) => Response) => {
  const requests: Request[] = [];
  const gateway = createMercadoPagoGateway({
    accessToken: "TEST-123-secret",
    async fetch(url, init) {
      const request = {
        url: String(url),
        method: init?.method ?? "GET",
        headers: init?.headers,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      };
      requests.push(request);
      return respond(request);
    },
  });
  return { gateway, requests };
};

const subscription = {
  cardToken: "card-token",
  payerEmail: "dona@sorriso.example",
  amountCents: 9990,
  startDate: new Date("2027-01-01T15:00:00Z"),
  reason: "ClickStudio Bots: plano mensal",
  externalReference: "tenant",
  backUrl: "https://bots.example.com/painel/assinatura",
};

describe("Mercado Pago gateway", () => {
  test("creates a monthly preapproval in BRL with the card token", async () => {
    const { gateway, requests } = gatewayAnswering(() => Response.json(preapproval));

    expect(await gateway.createSubscription(subscription)).toEqual({
      ok: true,
      subscription: {
        id: "2c938084726fca480172750000000000",
        status: "authorized",
        payerEmail: "dona@sorriso.example",
        amountCents: 9990,
        nextChargeAt: new Date("2027-01-01T15:00:00Z"),
        modifiedAt: new Date("2026-12-01T12:00:00Z"),
      },
    });
    expect(requests).toEqual([
      {
        url: "https://api.mercadopago.com/preapproval",
        method: "POST",
        headers: { Authorization: "Bearer TEST-123-secret", "Content-Type": "application/json" },
        body: {
          reason: "ClickStudio Bots: plano mensal",
          external_reference: "tenant",
          payer_email: "dona@sorriso.example",
          card_token_id: "card-token",
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: 99.9,
            currency_id: "BRL",
            start_date: "2027-01-01T15:00:00.000Z",
          },
          back_url: "https://bots.example.com/painel/assinatura",
          status: "authorized",
        },
      },
    ]);
  });

  test("leaves the start date out to charge now", async () => {
    const { gateway, requests } = gatewayAnswering(() => Response.json(preapproval));

    await gateway.createSubscription({ ...subscription, startDate: null });
    expect(requests[0].body).toMatchObject({
      auto_recurring: { transaction_amount: 99.9, currency_id: "BRL" },
    });
    expect((requests[0].body as { auto_recurring: object }).auto_recurring).not.toHaveProperty(
      "start_date",
    );
  });

  test("a refused card is rejected; an unavailable provider throws without its body", async () => {
    const refused = gatewayAnswering(() =>
      Response.json({ message: "Card token invalid", status: 400 }, { status: 400 }),
    );
    expect(await refused.gateway.createSubscription(subscription)).toEqual({
      ok: false,
      error: "rejected",
    });

    const down = gatewayAnswering(() => new Response("private vendor error", { status: 503 }));
    const failure = await down.gateway.createSubscription(subscription).catch((error) => error);
    expect(failure).toBeInstanceOf(MercadoPagoRequestError);
    expect(failure.httpStatus).toBe(503);
    expect(failure.message).not.toContain("private");
  });

  test("fetches and cancels a preapproval", async () => {
    const { gateway, requests } = gatewayAnswering((request) =>
      Response.json(
        request.method === "PUT"
          ? { ...preapproval, status: "cancelled", payer_email: "" }
          : preapproval,
      ),
    );

    expect(await gateway.fetchSubscription(preapproval.id)).toMatchObject({
      status: "authorized",
    });
    expect(await gateway.updateSubscription(preapproval.id, { status: "cancelled" })).toMatchObject(
      { status: "cancelled", payerEmail: null },
    );
    expect(requests.map(({ url, method, body }) => ({ url, method, body }))).toEqual([
      {
        url: `https://api.mercadopago.com/preapproval/${preapproval.id}`,
        method: "GET",
        body: undefined,
      },
      {
        url: `https://api.mercadopago.com/preapproval/${preapproval.id}`,
        method: "PUT",
        body: { status: "cancelled" },
      },
    ]);
  });

  test("reads a payment, and the Subscription it charged", async () => {
    const payment = {
      id: 1234567890,
      status: "approved",
      transaction_amount: 99.9,
      date_approved: "2026-12-01T10:00:00.000-03:00",
      point_of_interaction: { transaction_data: { subscription_id: preapproval.id } },
    };
    const { gateway, requests } = gatewayAnswering((request) =>
      Response.json(
        request.url.endsWith("/2") ? { ...payment, id: 2, point_of_interaction: {} } : payment,
      ),
    );

    expect(await gateway.fetchPayment("1234567890")).toEqual({
      id: "1234567890",
      status: "approved",
      amountCents: 9990,
      approvedAt: new Date("2026-12-01T13:00:00Z"),
      subscriptionId: preapproval.id,
    });
    expect((await gateway.fetchPayment("2")).subscriptionId).toBeNull();
    expect(requests[0].url).toBe("https://api.mercadopago.com/v1/payments/1234567890");
  });

  test("reads an authorized payment's Subscription and payment", async () => {
    const { gateway, requests } = gatewayAnswering(() =>
      Response.json({
        id: 6114264375,
        type: "scheduled",
        preapproval_id: preapproval.id,
        status: "processed",
        payment: { id: 1234567890, status: "approved", status_detail: "accredited" },
      }),
    );

    expect(await gateway.fetchAuthorizedPayment("6114264375")).toEqual({
      subscriptionId: preapproval.id,
      paymentId: "1234567890",
    });
    expect(requests[0].url).toBe("https://api.mercadopago.com/authorized_payments/6114264375");
  });

  test("refuses an id that could leave its path", async () => {
    const { gateway, requests } = gatewayAnswering(() => Response.json(preapproval));
    await expect(gateway.fetchPayment("../preapproval")).rejects.toThrow();
    expect(requests).toEqual([]);
  });
});

// Hashes computed with `openssl dgst -sha256 -hmac test-secret` over the
// manifest Mercado Pago documents: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`.
const secret = "test-secret";
const requestId = "bb56a2f1-6aae-46ac-982e-9dcd3581d08e";
const signed = "ts=1704908010,v1=aa03614f237c28380f08b45b5ad11eea289b7546c54c5c6a042611e605f16b3d";

describe("Mercado Pago webhook signature", () => {
  test("accepts the HMAC of the id, request id and timestamp", () => {
    expect(
      verifyMercadoPagoSignature({ signature: signed, requestId, dataId: "123456", secret }),
    ).toBe(true);
  });

  test("rejects another id, request id, secret or a malformed header", () => {
    const valid = { signature: signed, requestId, dataId: "123456", secret };
    expect(verifyMercadoPagoSignature({ ...valid, dataId: "123457" })).toBe(false);
    expect(verifyMercadoPagoSignature({ ...valid, requestId: "other" })).toBe(false);
    expect(verifyMercadoPagoSignature({ ...valid, secret: "other-secret" })).toBe(false);
    expect(verifyMercadoPagoSignature({ ...valid, signature: null })).toBe(false);
    expect(verifyMercadoPagoSignature({ ...valid, signature: "v1=aa03" })).toBe(false);
    expect(verifyMercadoPagoSignature({ ...valid, signature: "ts=1704908010" })).toBe(false);
    expect(
      verifyMercadoPagoSignature({ ...valid, signature: "ts=1704908011,v1=" + "0".repeat(64) }),
    ).toBe(false);
  });

  test("leaves a missing value's pair out of the manifest", () => {
    expect(
      verifyMercadoPagoSignature({
        signature:
          "ts=1704908010,v1=0352f16f83533519db8a5a675ee8eadebe882de153ed83c5fdb3083b8fb47d6e",
        requestId: null,
        dataId: "2c938084726fca480172750000000000",
        secret,
      }),
    ).toBe(true);
    expect(
      verifyMercadoPagoSignature({
        signature:
          "ts=1704908010,v1=664c032a99e6fa4a3dfc1e87d330b9020a480414772a2389b5601835d9179cd8",
        requestId,
        dataId: null,
        secret,
      }),
    ).toBe(true);
  });

  test("accepts an alphanumeric id signed in lowercase", () => {
    expect(
      verifyMercadoPagoSignature({
        signature:
          "ts=1704908010,v1=0352f16f83533519db8a5a675ee8eadebe882de153ed83c5fdb3083b8fb47d6e",
        requestId: null,
        dataId: "2C938084726FCA480172750000000000",
        secret,
      }),
    ).toBe(true);
  });
});
