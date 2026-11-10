import { describe, expect, test } from "bun:test";
import { createWhatsAppAdapter, whatsAppWebhookFields } from "@/platform/whatsapp";
import { createWhatsAppTokenCipher } from "@/platform/whatsapp-credentials";
import { RetryableError } from "@/platform/retryable";

const accessToken = "secret-business-token";
const options = {
  appId: "100",
  appSecret: "secret-app-key",
  graphVersion: "v26.0",
  activeKeyVersion: "2026-10",
  encryptionKeys: { "2026-10": Buffer.alloc(32, 7).toString("base64") },
};

describe("WhatsApp adapter", () => {
  test("disconnects the owning WABA without exposing credentials or vendor errors", async () => {
    const context = { tenantId: "tenant-a", wabaId: "200", phoneNumberId: "300" };
    const credential = createWhatsAppTokenCipher(
      options.activeKeyVersion,
      options.encryptionKeys,
    ).encrypt(accessToken, context);
    let fail = false;
    const requests: { url: string; init?: RequestInit }[] = [];
    const adapter = createWhatsAppAdapter({
      ...options,
      async fetch(url, init) {
        requests.push({ url: String(url), init });
        return fail
          ? new Response("private vendor error", { status: 500 })
          : Response.json({ success: true });
      },
    });
    expect(await adapter.unsubscribe({ ...context, credential })).toEqual({ ok: true });
    expect(requests[0].url).toBe("https://graph.facebook.com/v26.0/200/subscribed_apps");
    expect(requests[0].init?.method).toBe("DELETE");
    expect(requests[0].init?.headers).toEqual({ Authorization: `Bearer ${accessToken}` });
    fail = true;
    expect(await adapter.unsubscribe({ ...context, credential })).toEqual({ ok: false });
    expect(await adapter.unsubscribe({ ...context, tenantId: "tenant-b", credential })).toEqual({
      ok: false,
    });
    expect(requests).toHaveLength(2);
  });
  test("exchanges a code and discovers a coexistence number without exposing its token", async () => {
    const requests: { url: string; init?: RequestInit }[] = [];
    const adapter = createWhatsAppAdapter({
      ...options,
      async fetch(url, init) {
        requests.push({ url: String(url), init });
        return Response.json(
          requests.length === 1
            ? { access_token: accessToken }
            : {
                data: [
                  {
                    id: "300",
                    display_phone_number: "+55 11 99999-0000",
                    is_on_biz_app: true,
                    platform_type: "CLOUD_API",
                  },
                ],
              },
        );
      },
    });

    const result = await adapter.exchangeSignup({
      tenantId: "tenant-a",
      code: "one-time-code",
      wabaId: "200",
    });

    expect(result).toMatchObject({
      phoneNumberId: "300",
      displayPhoneNumber: "+55 11 99999-0000",
      credential: { keyVersion: "2026-10" },
    });
    expect(JSON.stringify(result)).not.toContain(accessToken);
    expect(requests[0].url).not.toContain("one-time-code");
    expect(requests[0].url).not.toContain(options.appSecret);
    expect(requests[1].init?.headers).toMatchObject({ Authorization: `Bearer ${accessToken}` });
  });

  test("decrypts an older key version only while subscribing the owning Channel", async () => {
    const context = { tenantId: "tenant-a", wabaId: "200", phoneNumberId: "300" };
    let calls = 0;
    const initial = createWhatsAppAdapter({
      ...options,
      async fetch() {
        return Response.json(
          ++calls === 1
            ? { access_token: accessToken }
            : {
                data: [
                  {
                    id: "300",
                    display_phone_number: "+5511999990000",
                    is_on_biz_app: true,
                    platform_type: "CLOUD_API",
                  },
                ],
              },
        );
      },
    });
    const connected = await initial.exchangeSignup({ ...context, code: "code" });
    const requests: { url: string; init?: RequestInit }[] = [];
    const rotated = createWhatsAppAdapter({
      ...options,
      activeKeyVersion: "2026-11",
      encryptionKeys: {
        ...options.encryptionKeys,
        "2026-11": Buffer.alloc(32, 8).toString("base64"),
      },
      async fetch(url, init) {
        requests.push({ url: String(url), init });
        return Response.json(
          String(url).endsWith("/subscriptions")
            ? {
                data: [
                  {
                    object: "whatsapp_business_account",
                    active: true,
                    fields: whatsAppWebhookFields.map((name) => ({ name })),
                  },
                ],
              }
            : { success: true },
        );
      },
    });

    expect(await rotated.subscribe({ ...context, credential: connected.credential })).toEqual({
      ok: true,
    });
    expect(requests[1].init?.headers).toEqual({ Authorization: `Bearer ${accessToken}` });
    expect(requests.every(({ url }) => !url.includes(accessToken))).toBe(true);
    expect(
      await rotated.subscribe({
        ...context,
        tenantId: "tenant-b",
        credential: connected.credential,
      }),
    ).toEqual({ ok: false, error: "subscription_failed" });
    expect(requests.filter(({ url }) => url.endsWith("/subscribed_apps"))).toHaveLength(1);
    expect(
      await rotated.subscribe({
        ...context,
        credential: { ...connected.credential, tag: Buffer.alloc(16).toString("base64") },
      }),
    ).toEqual({ ok: false, error: "subscription_failed" });
  });

  test("requires all app webhook fields instead of recording an incomplete subscription as successful", async () => {
    let calls = 0;
    const adapter = createWhatsAppAdapter({
      ...options,
      async fetch() {
        calls++;
        return Response.json({
          data: [
            { object: "whatsapp_business_account", active: true, fields: [{ name: "messages" }] },
          ],
        });
      },
    });
    expect(
      await adapter.subscribe({
        tenantId: "tenant-a",
        wabaId: "200",
        phoneNumberId: "300",
        credential: { keyVersion: "2026-10", iv: "", ciphertext: "", tag: "" },
      }),
    ).toEqual({ ok: false, error: "missing_webhook_fields" });
    expect(calls).toBe(1);
  });

  test("accepts the documented string form of active app subscription fields", async () => {
    let calls = 0;
    const initial = createWhatsAppAdapter({
      ...options,
      async fetch() {
        return Response.json(
          ++calls === 1
            ? { access_token: accessToken }
            : {
                data: [
                  {
                    id: "300",
                    display_phone_number: "+5511999990000",
                    is_on_biz_app: true,
                    platform_type: "CLOUD_API",
                  },
                ],
              },
        );
      },
    });
    const context = { tenantId: "tenant-a", wabaId: "200", phoneNumberId: "300" };
    const connected = await initial.exchangeSignup({ ...context, code: "code" });
    const adapter = createWhatsAppAdapter({
      ...options,
      async fetch(url) {
        return Response.json(
          String(url).endsWith("/subscriptions")
            ? {
                data: [
                  {
                    object: "whatsapp_business_account",
                    active: true,
                    fields: [
                      "messages",
                      "account_update",
                      "smb_message_echoes",
                      "history",
                      "smb_app_state_sync",
                    ],
                  },
                ],
              }
            : { success: true },
        );
      },
    });
    expect(await adapter.subscribe({ ...context, credential: connected.credential })).toEqual({
      ok: true,
    });
  });

  test("rejects an ungranted phone, an API-only phone and ambiguous coexistence numbers", async () => {
    for (const phones of [
      [
        {
          id: "300",
          display_phone_number: "+5511999990000",
          is_on_biz_app: false,
          platform_type: "CLOUD_API",
        },
      ],
      [
        {
          id: "301",
          display_phone_number: "+5511999990000",
          is_on_biz_app: true,
          platform_type: "CLOUD_API",
        },
      ],
    ]) {
      let calls = 0;
      const adapter = createWhatsAppAdapter({
        ...options,
        async fetch() {
          return Response.json(++calls === 1 ? { access_token: accessToken } : { data: phones });
        },
      });
      await expect(
        adapter.exchangeSignup({
          tenantId: "tenant-a",
          code: "code",
          wabaId: "200",
          phoneNumberId: "300",
        }),
      ).rejects.toThrow("WhatsApp signup failed");
    }
    let calls = 0;
    const adapter = createWhatsAppAdapter({
      ...options,
      async fetch() {
        return Response.json(
          ++calls === 1
            ? { access_token: accessToken }
            : {
                data: ["300", "301"].map((id) => ({
                  id,
                  display_phone_number: "+5511999990000",
                  is_on_biz_app: true,
                  platform_type: "CLOUD_API",
                })),
              },
        );
      },
    });
    await expect(
      adapter.exchangeSignup({ tenantId: "tenant-a", code: "code", wabaId: "200" }),
    ).rejects.toThrow("WhatsApp signup failed");
  });

  test("sanitizes transport and Meta errors without forwarding sensitive details", async () => {
    for (const fetch of [
      async () => {
        throw new Error(accessToken);
      },
      async () => Response.json({ error: { message: accessToken } }, { status: 400 }),
      async () => Response.json({ access_token: { value: accessToken } }),
    ]) {
      const adapter = createWhatsAppAdapter({ ...options, fetch });
      await expect(
        adapter.exchangeSignup({ tenantId: "tenant-a", code: "code", wabaId: "200" }),
      ).rejects.toThrow("WhatsApp signup failed");
    }
  });

  test("sends a text reply from the Channel's number and returns Meta's wamid", async () => {
    const context = { tenantId: "tenant-a", wabaId: "200", phoneNumberId: "300" };
    const credential = createWhatsAppTokenCipher(
      options.activeKeyVersion,
      options.encryptionKeys,
    ).encrypt(accessToken, context);
    const requests: { url: string; init?: RequestInit }[] = [];
    const adapter = createWhatsAppAdapter({
      ...options,
      async fetch(url, init) {
        requests.push({ url: String(url), init });
        return Response.json({
          messaging_product: "whatsapp",
          contacts: [{ input: "5511988887777", wa_id: "5511988887777" }],
          messages: [{ id: "wamid.OUT1" }],
        });
      },
    });

    expect(
      await adapter.sendText({
        ...context,
        credential,
        to: "5511988887777",
        text: "Abrimos às 9h!",
      }),
    ).toEqual({ wamid: "wamid.OUT1" });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://graph.facebook.com/v26.0/300/messages");
    expect(requests[0].init).toMatchObject({
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    });
    expect(JSON.parse(String(requests[0].init?.body))).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "5511988887777",
      type: "text",
      text: { body: "Abrimos às 9h!", preview_url: false },
    });
  });

  test("a refused or malformed send fails without forwarding sensitive details, and a foreign credential sends nothing", async () => {
    const context = { tenantId: "tenant-a", wabaId: "200", phoneNumberId: "300" };
    const credential = createWhatsAppTokenCipher(
      options.activeKeyVersion,
      options.encryptionKeys,
    ).encrypt(accessToken, context);
    for (const fetch of [
      async () => {
        throw new Error(accessToken);
      },
      async () => Response.json({ error: { message: accessToken } }, { status: 400 }),
      async () => Response.json({ messages: [] }),
    ]) {
      const adapter = createWhatsAppAdapter({ ...options, fetch });
      await expect(
        adapter.sendText({ ...context, credential, to: "5511988887777", text: "Oi" }),
      ).rejects.toThrow(/^WhatsApp send failed$/);
    }
    let calls = 0;
    const adapter = createWhatsAppAdapter({
      ...options,
      async fetch() {
        calls++;
        return Response.json({ messages: [{ id: "wamid.OUT1" }] });
      },
    });
    await expect(
      adapter.sendText({
        ...context,
        tenantId: "tenant-b",
        credential,
        to: "5511988887777",
        text: "Oi",
      }),
    ).rejects.toThrow("WhatsApp send failed");
    expect(calls).toBe(0);
  });

  test("only a send Meta refused for now is retryable; one that may have been sent is not", async () => {
    const context = { tenantId: "tenant-a", wabaId: "200", phoneNumberId: "300" };
    const credential = createWhatsAppTokenCipher(
      options.activeKeyVersion,
      options.encryptionKeys,
    ).encrypt(accessToken, context);
    const metaError = (status: number, code?: number) => async () =>
      Response.json({ error: { message: accessToken, code } }, { status });
    const send = (fetch: () => Promise<Response>) =>
      createWhatsAppAdapter({ ...options, fetch })
        .sendText({ ...context, credential, to: "5511988887777", text: "Oi" })
        .catch((error: unknown) => error);

    for (const fetch of [
      metaError(429),
      metaError(500, 2),
      metaError(503, 1),
      // Cloud API and pair rate limits arrive as 400s.
      metaError(400, 130429),
      metaError(400, 131056),
    ]) {
      const error = await send(fetch);
      expect(error).toBeInstanceOf(RetryableError);
      expect(String((error as Error).message)).not.toContain(accessToken);
    }
    for (const fetch of [
      // No answer from Meta, or one it may have sent before failing.
      async () => {
        throw new DOMException("timed out", "TimeoutError");
      },
      async () => {
        throw new TypeError("fetch failed");
      },
      async () => new Response("Bad gateway", { status: 502 }),
      async () => Response.json({ messages: [] }),
      // Refused for good.
      metaError(400, 100),
      metaError(401, 190),
    ]) {
      const error = await send(fetch);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(RetryableError);
    }
  });
});
