import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const apiUrl = "https://api.mercadopago.com";

// A failed Mercado Pago call. It keeps only the HTTP status: never the vendor
// body, URL, header or token.
export class MercadoPagoRequestError extends Error {
  override name = "MercadoPagoRequestError";
  constructor(
    readonly httpStatus?: number,
    options?: ErrorOptions,
  ) {
    super("Mercado Pago request failed", options);
  }
}

// Mercado Pago's ids are digits or hex; anything else could reach another
// path.
export const isMercadoPagoResourceId = (id: string) => /^[A-Za-z0-9_-]{1,64}$/.test(id);

const resourceId = (id: string) => {
  if (!isMercadoPagoResourceId(id)) throw new MercadoPagoRequestError();
  return id;
};

const centsOf = (amount: number) => Math.round(amount * 100);
const dateOf = (value: string | null | undefined) => (value ? new Date(value) : null);

const preapprovalSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1),
  payer_email: z.string().nullish(),
  auto_recurring: z.object({ transaction_amount: z.coerce.number() }),
  next_payment_date: z.string().nullish(),
  // The charge history in the preapproval reference.
  summarized: z
    .object({
      last_charged_date: z.string().nullish(),
      last_charged_amount: z.coerce.number().nullish(),
    })
    .nullish(),
  last_modified: z.string().min(1),
});

const paymentSchema = z.object({
  id: z.union([z.number(), z.string()]),
  status: z.string().min(1),
  transaction_amount: z.coerce.number(),
  date_created: z.string().min(1),
  date_approved: z.string().nullish(),
  external_reference: z.string().nullish(),
  // Where Mercado Pago names the preapproval a charge belongs to. Not in the
  // payments reference: confirm against a real subscription charge.
  point_of_interaction: z
    .object({
      transaction_data: z.object({ subscription_id: z.string().nullish() }).nullish(),
    })
    .nullish(),
  metadata: z.object({ preapproval_id: z.string().nullish() }).nullish(),
});

const authorizedPaymentSchema = z.object({
  preapproval_id: z.string().min(1),
  payment: z.object({ id: z.union([z.number(), z.string()]) }).nullish(),
});

const authorizedPaymentSearchSchema = z.object({
  paging: z.object({ total: z.number(), limit: z.number() }),
  results: z.array(authorizedPaymentSchema.extend({ date_created: z.string().min(1) })),
});

const toSubscription = (body: unknown) => {
  const preapproval = preapprovalSchema.parse(body);
  const lastChargedAt = dateOf(preapproval.summarized?.last_charged_date);
  const lastChargedAmount = preapproval.summarized?.last_charged_amount;
  return {
    id: preapproval.id,
    status: preapproval.status,
    payerEmail: preapproval.payer_email || null,
    amountCents: centsOf(preapproval.auto_recurring.transaction_amount),
    nextChargeAt: dateOf(preapproval.next_payment_date),
    lastCharge:
      lastChargedAt && typeof lastChargedAmount === "number"
        ? { at: lastChargedAt, amountCents: centsOf(lastChargedAmount) }
        : null,
    modifiedAt: new Date(preapproval.last_modified),
  };
};

// Subscriptions (`preapproval`) and the payments that settle them, on Mercado
// Pago's REST API. Implements `SubscriptionGateway` (`modules/billing`).
export const createMercadoPagoGateway = ({
  accessToken,
  fetch = globalThis.fetch,
}: {
  accessToken: string;
  fetch?: (url: string | URL, init?: RequestInit) => Promise<Response>;
}) => {
  const call = async (method: string, path: string, body?: object) => {
    let response: Response;
    try {
      response = await fetch(`${apiUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new MercadoPagoRequestError(undefined, { cause: error });
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new MercadoPagoRequestError(response.status);
    }
    return response.json() as Promise<unknown>;
  };

  return {
    async createSubscription(subscription: {
      cardToken: string;
      payerEmail: string;
      amountCents: number;
      startDate: Date | null;
      reason: string;
      externalReference: string;
      backUrl: string;
    }) {
      try {
        const created = await call("POST", "/preapproval", {
          reason: subscription.reason,
          external_reference: subscription.externalReference,
          payer_email: subscription.payerEmail,
          card_token_id: subscription.cardToken,
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: subscription.amountCents / 100,
            currency_id: "BRL",
            ...(subscription.startDate ? { start_date: subscription.startDate.toISOString() } : {}),
          },
          back_url: subscription.backUrl,
          status: "authorized",
        });
        return { ok: true as const, subscription: toSubscription(created) };
      } catch (error) {
        // A 4xx is Mercado Pago refusing the card or the request.
        const status = error instanceof MercadoPagoRequestError ? error.httpStatus : undefined;
        if (status && status >= 400 && status < 500)
          return { ok: false as const, error: "rejected" as const };
        throw error;
      }
    },

    async fetchSubscription(id: string) {
      return toSubscription(await call("GET", `/preapproval/${resourceId(id)}`));
    },

    async updateSubscription(id: string, change: { status?: "cancelled"; cardToken?: string }) {
      return toSubscription(
        await call("PUT", `/preapproval/${resourceId(id)}`, {
          ...(change.status ? { status: change.status } : {}),
          ...(change.cardToken ? { card_token_id: change.cardToken } : {}),
        }),
      );
    },

    async fetchPayment(id: string) {
      const payment = paymentSchema.parse(await call("GET", `/v1/payments/${resourceId(id)}`));
      return {
        id: String(payment.id),
        status: payment.status,
        amountCents: centsOf(payment.transaction_amount),
        createdAt: new Date(payment.date_created),
        approvedAt: dateOf(payment.date_approved),
        subscriptionId:
          payment.point_of_interaction?.transaction_data?.subscription_id ||
          payment.metadata?.preapproval_id ||
          null,
        externalReference: payment.external_reference || null,
      };
    },

    async fetchAuthorizedPayment(id: string) {
      const found = authorizedPaymentSchema.parse(
        await call("GET", `/authorized_payments/${resourceId(id)}`),
      );
      return {
        subscriptionId: found.preapproval_id,
        paymentId: found.payment ? String(found.payment.id) : null,
      };
    },

    // `GET /authorized_payments/search?preapproval_id=` documents no sort, so
    // the newest is picked by `date_created`. When there is more than one
    // page, the last page is read instead (`offset`/`limit`, as Mercado
    // Pago's other searches take them), assuming the oldest come first.
    // Confirm the order against a real Subscription with many charges.
    async fetchLatestAuthorizedPayment(subscriptionId: string) {
      const path = `/authorized_payments/search?${new URLSearchParams({
        preapproval_id: resourceId(subscriptionId),
      })}`;
      let page = authorizedPaymentSearchSchema.parse(await call("GET", path));
      const { total, limit } = page.paging;
      if (total > page.results.length && limit > 0)
        page = authorizedPaymentSearchSchema.parse(
          await call("GET", `${path}&offset=${Math.max(0, total - limit)}&limit=${limit}`),
        );
      const [latest] = page.results.toSorted(
        (a, b) => Date.parse(b.date_created) - Date.parse(a.date_created),
      );
      return latest
        ? {
            subscriptionId: latest.preapproval_id,
            paymentId: latest.payment ? String(latest.payment.id) : null,
          }
        : null;
    },
  };
};

// Mercado Pago's `x-signature` header is `ts=<seconds>,v1=<hex>`: the
// HMAC-SHA256, keyed with the webhook's secret, of the manifest
// `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`. A pair whose value is
// missing is left out. This follows the official SDK's validator
// (`WebhookSignatureValidator` in mercadopago/sdk-nodejs). The docs ask for an
// alphanumeric id in lowercase while the SDK signs it as received, so both
// spellings are accepted; either way only the secret's holder could sign it.
// There is no timestamp tolerance: Mercado Pago's retries are not documented
// to re-sign, and replaying a notification changes nothing (billing fetches
// the resource and applies it idempotently).
export const verifyMercadoPagoSignature = ({
  signature,
  requestId,
  dataId,
  secret,
}: {
  signature: string | null;
  requestId: string | null;
  dataId: string | null;
  secret: string;
}) => {
  if (!signature) return false;
  let ts: string | undefined;
  let hash: string | undefined;
  for (const part of signature.split(",")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim().toLowerCase();
    const value = part.slice(separator + 1).trim();
    if (key === "ts") ts = value;
    else if (key === "v1") hash = value.toLowerCase();
  }
  if (!ts || !/^\d+$/.test(ts) || !hash || !/^[0-9a-f]{64}$/.test(hash)) return false;

  const ids = dataId ? [...new Set([dataId.trim(), dataId.trim().toLowerCase()])] : [null];
  return ids.some((id) => {
    const parts = [];
    if (id) parts.push(`id:${id}`);
    if (requestId?.trim()) parts.push(`request-id:${requestId.trim()}`);
    parts.push(`ts:${ts}`);
    const expected = createHmac("sha256", secret)
      .update(`${parts.join(";")};`)
      .digest();
    return timingSafeEqual(expected, Buffer.from(hash, "hex"));
  });
};
