"use client";

import { useEffect, useId, useRef, useState } from "react";

// Mercado Pago's browser SDK, which renders the Card Payment Brick inside its
// own iframe and turns the card into a token there (ADR 0012): card data
// never reaches our servers.
const sdkUrl = "https://sdk.mercadopago.com/js/v2";

type BrickController = { unmount(): void };
type MercadoPagoSdk = new (
  publicKey: string,
  options: { locale: string },
) => {
  bricks(): {
    create(name: "cardPayment", containerId: string, settings: object): Promise<BrickController>;
  };
};

declare global {
  interface Window {
    MercadoPago?: MercadoPagoSdk;
  }
}

let sdk: Promise<MercadoPagoSdk> | null = null;

// Loads the SDK once per page; a failed load may be tried again.
const loadSdk = () => {
  sdk ??= new Promise<MercadoPagoSdk>((resolve, reject) => {
    if (window.MercadoPago) return resolve(window.MercadoPago);
    const script = document.createElement("script");
    script.src = sdkUrl;
    script.async = true;
    script.onload = () =>
      window.MercadoPago ? resolve(window.MercadoPago) : reject(new Error("SDK missing"));
    script.onerror = () => reject(new Error("SDK failed to load"));
    document.head.append(script);
  }).catch((error: unknown) => {
    sdk = null;
    throw error;
  });
  return sdk;
};

// Renders the Card Payment Brick into the element with `containerId`, for a
// credit card in one installment. `onSubmit` receives the card token; its
// promise settles the Brick's button (a rejection shows the Brick's error).
// `payerEmail` is the Brick's initial email: changing it doesn't remount.
export const useCardPaymentBrick = ({
  publicKey,
  amountCents,
  payerEmail,
  onSubmit,
}: {
  publicKey: string;
  amountCents: number;
  payerEmail: string;
  onSubmit: (cardToken: string) => Promise<void>;
}) => {
  const containerId = `card-payment-${useId().replace(/[^A-Za-z0-9]/g, "")}`;
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const submit = useRef(onSubmit);
  const initialEmail = useRef(payerEmail);

  useEffect(() => {
    submit.current = onSubmit;
  });

  useEffect(() => {
    let cancelled = false;
    let controller: BrickController | null = null;
    loadSdk()
      .then(async (MercadoPago) => {
        if (cancelled) return;
        const created = await new MercadoPago(publicKey, { locale: "pt-BR" })
          .bricks()
          .create("cardPayment", containerId, {
            initialization: {
              amount: amountCents / 100,
              payer: { email: initialEmail.current },
            },
            customization: {
              paymentMethods: {
                maxInstallments: 1,
                types: { excluded: ["debit_card", "prepaid_card"] },
              },
            },
            callbacks: {
              onReady: () => setStatus("ready"),
              onSubmit: ({ token }: { token: string }) => submit.current(token),
              // Field errors are shown inside the Brick.
              onError: () => {},
            },
          });
        if (cancelled) created.unmount();
        else controller = created;
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });
    return () => {
      cancelled = true;
      controller?.unmount();
    };
  }, [publicKey, amountCents, containerId]);

  return { containerId, status };
};
