import { fakeGraphPort } from "@/test/e2e/environment";

// Stands in for Meta's Graph API while the browser suite runs: it accepts
// every text send and remembers it, so a test can check what reached "Meta",
// and accepts typing indicators without remembering them.
// Anything else gets Meta's error shape, so an unexpected call fails loudly.

type Send = { phoneNumberId: string; authorization: string | null; to: string; text: string };

const sends: Send[] = [];
const sendPath = /^\/v\d+\.\d+\/(\d+)\/messages$/;

Bun.serve({
  hostname: "127.0.0.1",
  port: fakeGraphPort,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/__e2e/health") return new Response("ok");
    if (pathname === "/__e2e/sends") return Response.json(sends);

    const send = pathname.match(sendPath);
    if (request.method === "POST" && send) {
      const body = (await request.json()) as
        { status: "read" } | { status?: undefined; to: string; text: { body: string } };
      // A read receipt with a typing indicator sends nothing to the Contact.
      if (body.status === "read") return Response.json({ success: true });
      sends.push({
        phoneNumberId: send[1],
        authorization: request.headers.get("authorization"),
        to: body.to,
        text: body.text.body,
      });
      return Response.json({
        messaging_product: "whatsapp",
        contacts: [{ input: body.to, wa_id: body.to }],
        messages: [{ id: `wamid.E2E.OUT${sends.length}` }],
      });
    }
    return Response.json(
      { error: { message: "Not faked", type: "OAuthException", code: 100 } },
      { status: 400 },
    );
  },
});

console.log(`Fake Graph API listening on port ${fakeGraphPort}`);
