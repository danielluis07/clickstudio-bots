import { beforeEach, describe, expect, test } from "bun:test";
import type { ChannelRoute } from "@/modules/channels";
import { noContactDetails } from "@/modules/conversations";
import {
  createBotCore,
  disabledCapture,
  splitTokens,
  type BotTurn,
  type CaptureSettings,
  type ContextMessage,
  type TurnTokens,
} from "@/modules/bot";
import { createTestBotRepository, type TestBotRepository } from "@/test/support/bot";
import { createTestClock } from "@/test/support/clock";
import { createTestModel, type TestModel } from "@/test/support/model";

// The proof a live turn carries; resolveChannelPhoneNumber makes the real one.
const turn: BotTurn = {
  scope: { channelId: "channel-a", tenantId: "tenant-a" } as ChannelRoute,
  conversationId: "conversation-a",
};
const start = new Date("2026-03-10T12:00:00.000Z");
const clock = createTestClock(start);
let model: TestModel;
let repository: TestBotRepository;
// The latest turn's tokens; undefined when it made no Model request.
let tokens: TurnTokens | undefined;

const minutesAgo = (minutes: number) => new Date(clock.now().getTime() - minutes * 60_000);
const fromContact = (text: string, sentAt = minutesAgo(1)): ContextMessage => ({
  author: "contact",
  text,
  sentAt,
});

// Answers with the decision alone; the turn's tokens go to `tokens`.
const core = (options: Partial<Parameters<typeof createBotCore>[0]> = {}) => {
  const bot = createBotCore({ model, repository, clock, ...options });
  return {
    async respond(turn: BotTurn) {
      const outcome = await bot.respond(turn);
      tokens = outcome.kind === "nothing_to_answer" ? undefined : outcome.tokens;
      return splitTokens(outcome).decision;
    },
  };
};

beforeEach(() => {
  clock.set(start);
  model = createTestModel();
  repository = createTestBotRepository();
  tokens = undefined;
  repository.messages = [fromContact("Quanto custa o corte?")];
});

describe("configured Tenant links", () => {
  const booking = {
    id: "00000000-0000-4000-8000-000000000001",
    label: "Agendamento",
    url: "https://booking.example/agendar?origem=bot",
  };
  const payment = {
    id: "00000000-0000-4000-8000-000000000002",
    label: "Pagamento",
    url: "https://booking.example/pagar",
  };
  const send = (input: unknown) => ({ id: "link-call", name: "send_configured_link", input });

  test("a configured label cannot add a booking or payment confirmation to the reply", async () => {
    repository.links = {
      enabled: true,
      links: [{ ...booking, label: "Seu pagamento foi confirmado" }],
    };
    model.script({ toolCalls: [send({ linkId: booking.id })] });
    expect(await core().respond(turn)).toEqual({
      kind: "answer",
      reply: `Acesse o link: ${booking.url}\n\nO envio deste link não confirma agendamento nem pagamento. A equipe pode ajudar se precisar.`,
    });
  });

  test("an oversized selection can be corrected to one complete URL with a Handoff notice", async () => {
    const longBooking = { ...booking, url: "https://booking.example/" + "a".repeat(2020) };
    repository.links = {
      enabled: true,
      links: [longBooking, { ...payment, url: "https://booking.example/" + "b".repeat(2020) }],
    };
    model.script(
      {
        toolCalls: [
          send({ linkId: booking.id }),
          { ...send({ linkId: payment.id }), id: "payment" },
        ],
      },
      {
        toolCalls: [
          send({ linkId: booking.id }),
          { id: "handoff", name: "handoff", input: { reason: "sem_resposta" } },
        ],
      },
    );
    const outcome = await core().respond(turn);
    expect(outcome).toMatchObject({
      kind: "handoff",
      reason: "sem_resposta",
      reply: `Acesse o link: ${longBooking.url}\n\nO envio deste link não confirma agendamento nem pagamento. A equipe pode ajudar se precisar.\n\nSobre o restante, vou chamar alguém da equipe.`,
    });
    expect("reply" in outcome && outcome.reply.length <= 4096).toBe(true);
  });

  test("oversized link selections are refused whole and never sent as truncated URLs", async () => {
    repository.links = {
      enabled: true,
      links: [
        { ...booking, url: "https://booking.example/" + "a".repeat(2020) },
        { ...payment, url: "https://booking.example/" + "b".repeat(2020) },
      ],
    };
    const response = {
      toolCalls: [send({ linkId: booking.id }), { ...send({ linkId: payment.id }), id: "payment" }],
    };
    model.script(response, response);
    expect(await core().respond(turn)).toMatchObject({
      kind: "handoff",
      reason: "bot_indisponivel",
    });
    expect(model.requests).toHaveLength(2);
    expect(model.requests[1].messages.at(-1)).toMatchObject({
      role: "tool",
      results: [{ error: expect.any(String) }, { error: expect.any(String) }],
    });
  });

  test.each([booking, payment])(
    "sends the exact saved $label link, replacing model confirmation claims with safe wording",
    async (link) => {
      repository.links = { enabled: true, links: [booking, payment] };
      model.script({
        text: "Agendamento confirmado e pagamento aprovado! https://invented.example/pagar",
        toolCalls: [send({ linkId: link.id })],
      });
      expect(await core().respond(turn)).toEqual({
        kind: "answer",
        reply: `Acesse o link: ${link.url}\n\nO envio deste link não confirma agendamento nem pagamento. A equipe pode ajudar se precisar.`,
      });
      expect(model.requests[0].instructions).toContain(link.id);
      expect(model.requests[0].instructions).not.toContain(link.url);
      expect(
        model.requests[0].tools.find(({ name }) => name === "send_configured_link"),
      ).toBeDefined();
      expect(model.requests).toHaveLength(1);
    },
  );

  test.each([
    ["an arbitrary URL as id", { linkId: "https://evil.example" }, true],
    ["an extra URL", { linkId: booking.id, url: "https://evil.example" }, true],
    ["another Tenant's id", { linkId: "00000000-0000-4000-8000-000000000099" }, true],
    ["a Tenant argument", { linkId: booking.id, tenantId: "tenant-b" }, true],
    ["a missing id", {}, true],
    ["a disabled capability", { linkId: booking.id }, false],
  ] as const)(
    "refuses %s and safely hands off after one failed correction",
    async (_case, input, enabled) => {
      repository.links = { enabled, links: [booking] };
      const invalid = {
        text: "Pagamento confirmado! https://evil.example",
        toolCalls: [send(input)],
      };
      model.script(invalid, invalid);
      expect(await core().respond(turn)).toEqual({
        kind: "handoff",
        reason: "bot_indisponivel",
        reply: "No momento não consigo responder, vou chamar alguém da equipe.",
      });
      expect(model.requests).toHaveLength(2);
      expect(model.requests[1].messages.at(-1)).toMatchObject({
        role: "tool",
        results: [{ name: "send_configured_link", error: expect.any(String) }],
      });
      if (!enabled) expect(model.requests[0].instructions).not.toContain(booking.id);
    },
  );

  test("a refused arbitrary URL can be corrected to a configured id without leaking the refused text", async () => {
    repository.links = { enabled: true, links: [booking] };
    model.script(
      { text: "Acesse https://evil.example", toolCalls: [send({ url: "https://evil.example" })] },
      { toolCalls: [send({ linkId: booking.id })] },
    );
    const outcome = await core().respond(turn);
    expect(outcome).toMatchObject({ kind: "answer", reply: expect.stringContaining(booking.url) });
    expect(outcome).not.toMatchObject({ reply: expect.stringContaining("evil.example") });
    expect(tokens!.toolRoundTrips).toBe(1);
  });

  test("the next turn uses edited links and refuses removed IDs", async () => {
    repository.links = { enabled: true, links: [booking] };
    model.script({ toolCalls: [send({ linkId: booking.id })] });
    const bot = core();
    await bot.respond(turn);
    repository.links = {
      enabled: true,
      links: [{ ...payment, url: "https://booking.example/novo" }],
    };
    model.script(
      { toolCalls: [send({ linkId: booking.id })] },
      { toolCalls: [send({ linkId: payment.id })] },
    );
    expect(await bot.respond(turn)).toMatchObject({
      kind: "answer",
      reply: expect.stringContaining("https://booking.example/novo"),
    });
    expect(model.requests[1].instructions).not.toContain(booking.id);
  });

  test("multiple valid links are sent once each with a Handoff notice and no model commitments", async () => {
    repository.links = { enabled: true, links: [booking, payment] };
    model.script({
      text: "Sua reserva está garantida!",
      toolCalls: [
        send({ linkId: booking.id }),
        { ...send({ linkId: payment.id }), id: "pay" },
        { ...send({ linkId: booking.id }), id: "duplicate" },
        { id: "handoff", name: "handoff", input: { reason: "sem_resposta" } },
      ],
    });
    const outcome = await core().respond(turn);
    expect(outcome).toMatchObject({
      kind: "handoff",
      reason: "sem_resposta",
      reply: `Acesse o link: ${booking.url}\n\nAcesse o link: ${payment.url}\n\nO envio deste link não confirma agendamento nem pagamento. A equipe pode ajudar se precisar.\n\nSobre o restante, vou chamar alguém da equipe.`,
    });
  });

  test("one invalid call prevents a simultaneous link and capture from taking effect", async () => {
    repository.links = { enabled: true, links: [booking] };
    repository.capture = {
      enabled: true,
      fields: { name: "optional", email: "off", city: "off", need: "off" },
    };
    model.script(
      {
        text: "Confirmado!",
        toolCalls: [
          send({ linkId: booking.id }),
          { id: "capture", name: "capture_contact_details", input: { name: "Ana" } },
          { id: "invalid", name: "http_request", input: { url: "https://evil.example" } },
        ],
      },
      { text: "Posso ajudar com mais alguma coisa?" },
    );
    expect(await core().respond(turn)).toEqual({
      kind: "answer",
      reply: "Posso ajudar com mais alguma coisa?",
    });
    expect(repository.captured).toEqual([]);
  });
});

describe("grounded answers", () => {
  test("answers from the Knowledge base it was given", async () => {
    model.script((request) => ({
      text: request.knowledgeBase.includes("O corte custa R$ 80.") ? "O corte custa R$ 80." : "?",
    }));

    expect(await core().respond(turn)).toEqual({ kind: "answer", reply: "O corte custa R$ 80." });
    const [request] = model.requests;
    expect(request.messages).toEqual([{ role: "user", text: "Quanto custa o corte?" }]);
    expect(request.instructions).toContain("Barbearia Navalha");
    expect(request.instructions).toContain("Não marcamos horário pelo WhatsApp");
    expect(request.knowledgeBase).toContain("Pagamento");
    expect(request.knowledgeBase).toContain("Aceitamos PIX e cartão.");
    expect(request.tools.map((tool) => tool.name)).toEqual(["handoff"]);
  });
});

describe("cached prompt prefix", () => {
  test("is identical across turns until the Tenant saves an edit, which the next turn uses", async () => {
    model.script({ text: "Oi!" }, { text: "Oi!" }, { text: "Oi!" });
    const prefix = (index: number) => {
      const { tools, instructions, knowledgeBase } = model.requests[index];
      return { tools, instructions, knowledgeBase };
    };

    await core().respond(turn);
    clock.advance(60_000);
    repository.messages = [...repository.messages, fromContact("E a barba?")];
    await core().respond(turn);
    repository.knowledgeBase = {
      ...repository.knowledgeBase,
      faqs: [{ question: "Quanto custa o corte?", answer: "O corte custa R$ 90." }],
    };
    await core().respond(turn);

    expect(prefix(1)).toEqual(prefix(0));
    expect(prefix(2).knowledgeBase).toContain("R$ 90");
    expect(prefix(2).knowledgeBase).not.toContain("R$ 80");
  });
});

describe("behaviour settings", () => {
  test("shape the instructions: profile, weekly hours, tone, emoji, greeting, rules and topics", async () => {
    repository.behaviour = {
      ...repository.behaviour,
      tone: "formal",
      emoji: true,
      refusedTopics: ["política", "religião"],
      handoffTopics: ["reclamações", "reembolsos"],
    };
    model.script({ text: "Olá." });

    await core().respond(turn);

    const { instructions } = model.requests[0];
    expect(instructions).toContain(
      [
        "# Style",
        "Tone: formal and polite.",
        "Emoji: allowed, sparingly.",
        "Greeting to use when a Contact first writes: Olá! Aqui é a Barbearia Navalha.",
        "",
        "# Business profile",
        "Name: Barbearia Navalha",
        "Offer: Cortes de cabelo e barba",
        "Address: Rua das Flores, 100, São Paulo",
        "Opening hours (São Paulo time):",
        "- Monday: closed",
        "- Tuesday: 09:00 to 19:00",
        "- Wednesday: 09:00 to 19:00",
        "- Thursday: 09:00 to 19:00",
        "- Friday: 09:00 to 19:00",
        "- Saturday: 09:00 to 19:00",
        "- Sunday: closed",
        "",
        "# Business rules",
        "Não marcamos horário pelo WhatsApp; envie o link de agendamento.",
        "Refused topics: política; religião",
        "Topics handed to the team: reclamações; reembolsos",
      ].join("\n"),
    );
  });

  test("blank settings leave their lines out, and unset hours are not called closed", async () => {
    repository.behaviour = {
      ...repository.behaviour,
      offer: "",
      address: " ",
      greeting: "",
      rules: "",
      refusedTopics: [],
      handoffTopics: [],
      hours: Object.fromEntries(
        Object.keys(repository.behaviour.hours).map((day) => [day, null]),
      ) as typeof repository.behaviour.hours,
    };
    model.script({ text: "Olá." });

    await core().respond(turn);

    const { instructions } = model.requests[0];
    expect(instructions).toContain(
      "# Business profile\nName: Barbearia Navalha\n\n# Business rules\nNone.",
    );
    expect(instructions).not.toContain("Greeting");
    expect(instructions).not.toContain("closed");
    expect(instructions.endsWith("None.")).toBe(true);
  });

  test("changing only the schedule leaves the cached prefix unchanged", async () => {
    model.script({ text: "Oi!" }, { text: "Oi!" });

    await core().respond(turn);
    repository.behaviour = { ...repository.behaviour, schedule: "outside_business_hours" };
    await core().respond(turn);

    const [before, after] = model.requests;
    expect(after.instructions).toBe(before.instructions);
  });
});

const handoffCall = (reason: string, input: Record<string, unknown> = {}, id = "call-1") => ({
  id,
  name: "handoff",
  input: { reason, ...input },
});

describe("Handoff", () => {
  test("unknown information hands off as sem_resposta with a short closing line", async () => {
    repository.messages = [fromContact("Vocês fazem luzes?")];
    model.script({ toolCalls: [handoffCall("sem_resposta")] });

    expect(await core().respond(turn)).toEqual({
      kind: "handoff",
      reason: "sem_resposta",
      reply: "Não tenho essa informação, vou chamar alguém da equipe.",
    });
  });

  test("contradictory Knowledge base entries hand off as sem_resposta", async () => {
    repository.knowledgeBase = {
      faqs: [
        { question: "Quanto custa a barba?", answer: "A barba custa R$ 40." },
        { question: "Preço da barba", answer: "A barba custa R$ 50." },
      ],
      sections: [],
    };
    repository.messages = [fromContact("Quanto custa a barba?")];
    model.script((request) =>
      request.knowledgeBase.includes("R$ 40") && request.knowledgeBase.includes("R$ 50")
        ? { toolCalls: [handoffCall("sem_resposta")] }
        : { text: "A barba custa R$ 40." },
    );

    expect(await core().respond(turn)).toEqual({
      kind: "handoff",
      reason: "sem_resposta",
      reply: "Não tenho essa informação, vou chamar alguém da equipe.",
    });
  });

  test("a mixed question gets the answerable part and a Handoff in one reply", async () => {
    repository.messages = [fromContact("Quanto custa o corte? E vocês fazem luzes?")];
    model.script({ text: "O corte custa R$ 80.", toolCalls: [handoffCall("sem_resposta")] });

    expect(await core().respond(turn)).toEqual({
      kind: "handoff",
      reason: "sem_resposta",
      reply: "O corte custa R$ 80.\n\nSobre o restante, vou chamar alguém da equipe.",
    });
  });

  test("every Handoff reply tells the Contact the team will reply, whatever the model wrote", async () => {
    repository.messages = [fromContact("Quero falar com alguém")];
    model.script({ text: "Claro!", toolCalls: [handoffCall("pedido_do_contato")] });

    expect(await core().respond(turn)).toEqual({
      kind: "handoff",
      reason: "pedido_do_contato",
      reply: "Claro!\n\nCerto, vou chamar alguém da equipe para continuar o atendimento.",
    });
  });

  test("a Contact asking for a person hands off as pedido_do_contato", async () => {
    repository.messages = [fromContact("Quero falar com uma pessoa")];
    model.script({ toolCalls: [handoffCall("pedido_do_contato")] });

    expect(await core().respond(turn)).toEqual({
      kind: "handoff",
      reason: "pedido_do_contato",
      reply: "Certo, vou chamar alguém da equipe para continuar o atendimento.",
    });
  });

  test("a Tenant Handoff topic hands off as regra_do_negocio", async () => {
    repository.messages = [fromContact("Quero fazer uma reclamação")];
    model.script((request) =>
      request.instructions.includes("reclamações")
        ? { toolCalls: [handoffCall("regra_do_negocio")] }
        : { text: "Pode falar!" },
    );

    expect(await core().respond(turn)).toEqual({
      kind: "handoff",
      reason: "regra_do_negocio",
      reply: "Vou passar seu atendimento para a equipe, que responderá em breve.",
    });
  });
});

describe("tool call validation", () => {
  test("an invalid call is refused to the model and retried once", async () => {
    model.script(
      { text: "Um momento.", toolCalls: [handoffCall("talvez")] },
      { toolCalls: [{ id: "call-2", name: "handoff", input: { reason: "sem_resposta" } }] },
    );

    expect(await core().respond(turn)).toEqual({
      kind: "handoff",
      reason: "sem_resposta",
      reply: "Não tenho essa informação, vou chamar alguém da equipe.",
    });
    const retry = model.requests[1];
    expect(retry.messages.slice(0, -2)).toEqual(model.requests[0].messages);
    expect(retry.messages.at(-2)).toEqual({
      role: "assistant",
      text: "Um momento.",
      toolCalls: [handoffCall("talvez")],
    });
    expect(retry.messages.at(-1)).toMatchObject({
      role: "tool",
      results: [{ callId: "call-1", name: "handoff" }],
    });
  });

  test("a second invalid call hands off without a third request", async () => {
    model.script(
      { toolCalls: [{ id: "call-1", name: "handoff", input: "not json" }] },
      { text: "O corte custa R$ 80.", toolCalls: [{ id: "call-2", name: "handoff", input: {} }] },
    );

    expect(await core().respond(turn)).toEqual({
      kind: "handoff",
      reason: "bot_indisponivel",
      reply: "No momento não consigo responder, vou chamar alguém da equipe.",
    });
    expect(model.requests).toHaveLength(2);
  });

  test("tools outside the catalog, or not offered to this Tenant, are refused", async () => {
    model.script(
      { toolCalls: [{ id: "call-1", name: "send_payment", input: { amount: 10 } }] },
      { toolCalls: [{ id: "call-2", name: "capture_contact", input: { name: "Ana" } }] },
    );

    expect(await core().respond(turn)).toMatchObject({
      kind: "handoff",
      reason: "bot_indisponivel",
    });
    expect(model.requests[1].messages.at(-1)).toMatchObject({
      role: "tool",
      results: [{ callId: "call-1", name: "send_payment" }],
    });
  });

  test("every call in a response with an invalid one is refused, valid ones included", async () => {
    model.script(
      {
        toolCalls: [handoffCall("sem_resposta"), { id: "call-2", name: "send_payment", input: {} }],
      },
      { text: "O corte custa R$ 80." },
    );

    expect(await core().respond(turn)).toEqual({ kind: "answer", reply: "O corte custa R$ 80." });
    expect(model.requests[1].messages.at(-1)).toMatchObject({
      role: "tool",
      results: [
        { callId: "call-1", name: "handoff" },
        { callId: "call-2", name: "send_payment" },
      ],
    });
  });

  test("Tenant and Conversation ids from the model are ignored; the turn's scope applies", async () => {
    model.script({
      toolCalls: [
        handoffCall("pedido_do_contato", {
          tenantId: "tenant-b",
          conversationId: "conversation-b",
        }),
      ],
    });

    expect(await core().respond(turn)).toEqual({
      kind: "handoff",
      reason: "pedido_do_contato",
      reply: "Certo, vou chamar alguém da equipe para continuar o atendimento.",
    });
    expect(repository.turns).toEqual([turn]);
  });
});

describe("provider failures", () => {
  const unavailable = "No momento não consigo responder, vou chamar alguém da equipe.";

  test("a provider error hands off as bot_indisponivel, with no other provider tried", async () => {
    model.script(new Error("529 overloaded"));

    expect(await core().respond(turn)).toEqual({
      kind: "handoff",
      reason: "bot_indisponivel",
      reply: unavailable,
    });
    expect(model.requests).toHaveLength(1);
  });

  test("a provider timeout hands off as bot_indisponivel", async () => {
    model.script(new DOMException("The operation timed out.", "TimeoutError"));

    expect(await core().respond(turn)).toEqual({
      kind: "handoff",
      reason: "bot_indisponivel",
      reply: unavailable,
    });
  });

  test("a provider error during the retry hands off and still counts the first request", async () => {
    model.script(
      { toolCalls: [handoffCall("talvez")], usage: { inputTokens: 30, outputTokens: 5 } },
      new Error("500"),
    );

    expect(await core().respond(turn)).toEqual({
      kind: "handoff",
      reason: "bot_indisponivel",
      reply: unavailable,
    });
    expect(tokens).toEqual({
      inputTokens: 30,
      outputTokens: 5,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      toolRoundTrips: 1,
    });
  });

  test("an empty response hands off rather than send nothing", async () => {
    model.script({ text: "  " });

    expect(await core().respond(turn)).toEqual({
      kind: "handoff",
      reason: "bot_indisponivel",
      reply: unavailable,
    });
  });
});

describe("Conversation context", () => {
  const day = 24 * 60;

  test("replays at most the last 20 messages from the last 7 days", async () => {
    repository.messages = [
      fromContact("Mensagem antiga", minutesAgo(8 * day)),
      ...Array.from({ length: 25 }, (_, index) =>
        fromContact(`Mensagem ${index + 1}`, minutesAgo(25 - index)),
      ),
    ];
    model.script({ text: "Oi!" });

    await core().respond(turn);

    const texts = model.requests[0].messages.map(
      (message) => message.role === "user" && message.text,
    );
    expect(texts).toEqual(Array.from({ length: 20 }, (_, index) => `Mensagem ${index + 6}`));
  });

  test("drops messages older than 7 days even within the 20", async () => {
    repository.messages = [
      fromContact("Semana passada", minutesAgo(7 * day + 1)),
      fromContact("Hoje"),
    ];
    model.script({ text: "Oi!" });

    await core().respond(turn);

    expect(model.requests[0].messages).toEqual([{ role: "user", text: "Hoje" }]);
  });

  test("the caps are configurable", async () => {
    repository.messages = [
      fromContact("Ontem", minutesAgo(day + 1)),
      fromContact("Primeira", minutesAgo(3)),
      fromContact("Segunda", minutesAgo(2)),
      fromContact("Terceira", minutesAgo(1)),
    ];
    model.script({ text: "Oi!" });

    await core({ context: { maxMessages: 2, maxAgeDays: 1 } }).respond(turn);

    expect(model.requests[0].messages).toEqual([
      { role: "user", text: "Segunda" },
      { role: "user", text: "Terceira" },
    ]);
  });

  test("asks the repository for the capped window only", async () => {
    const asked: { since: Date; limit: number }[] = [];
    const listRecentMessages = repository.listRecentMessages;
    repository.listRecentMessages = async (scope, window) => {
      asked.push(window);
      return listRecentMessages(scope, window);
    };
    model.script({ text: "Oi!" });

    await core().respond(turn);

    expect(asked).toEqual([{ since: new Date("2026-03-03T12:00:00.000Z"), limit: 20 }]);
  });

  test("labels Member replies apart from Bot replies, in the order sent", async () => {
    repository.messages = [
      { author: "member", text: "Pode vir às 15h.", sentAt: minutesAgo(3) },
      fromContact("Oi, quanto custa o corte?", minutesAgo(5)),
      { author: "bot", text: "O corte custa R$ 80.", sentAt: minutesAgo(4) },
      fromContact("Obrigado!", minutesAgo(2)),
    ];
    model.script({ text: "Por nada!" });

    await core().respond(turn);

    expect(model.requests[0].messages).toEqual([
      { role: "user", text: "Oi, quanto custa o corte?" },
      { role: "assistant", text: "O corte custa R$ 80." },
      { role: "assistant", text: "[Team member] Pode vir às 15h." },
      { role: "user", text: "Obrigado!" },
    ]);
  });

  test("starts the replay at a Contact message", async () => {
    repository.messages = [
      { author: "bot", text: "O corte custa R$ 80.", sentAt: minutesAgo(3) },
      fromContact("E a barba?", minutesAgo(2)),
    ];
    model.script({ text: "Não tenho essa informação." });

    await core().respond(turn);

    expect(model.requests[0].messages).toEqual([{ role: "user", text: "E a barba?" }]);
  });

  test("with no unanswered Contact message there is nothing to answer and no request", async () => {
    repository.messages = [
      fromContact("Oi", minutesAgo(3)),
      { author: "bot", text: "Olá!", sentAt: minutesAgo(2) },
    ];

    expect(await core().respond(turn)).toEqual({ kind: "nothing_to_answer" });
    expect(model.requests).toHaveLength(0);
    expect(tokens).toBeUndefined();
  });

  test("forwards only author and text, so a Contact phone number never reaches the model", async () => {
    const phone = "5511988887777";
    // As if an adapter returned more of the row than the port declares.
    repository.messages = [
      { ...fromContact("Oi"), phone, contactId: "contact-a" } as ContextMessage,
    ];
    model.script({ text: "Oi!" });

    await core().respond(turn);

    expect(JSON.stringify(model.requests)).not.toContain(phone);
    expect(model.requests[0].messages).toEqual([{ role: "user", text: "Oi" }]);
  });
});

describe("turn tokens", () => {
  test("the outcome carries tokens, cache and tool round trips, summed over the turn", async () => {
    model.script(
      {
        toolCalls: [handoffCall("talvez")],
        usage: { inputTokens: 40, outputTokens: 12, cacheReadTokens: 0, cacheWriteTokens: 9000 },
      },
      {
        text: "O corte custa R$ 80.",
        usage: { inputTokens: 60, outputTokens: 20, cacheReadTokens: 9000, cacheWriteTokens: 0 },
      },
    );

    expect(await createBotCore({ model, repository, clock }).respond(turn)).toEqual({
      kind: "answer",
      reply: "O corte custa R$ 80.",
      tokens: {
        inputTokens: 100,
        outputTokens: 32,
        cacheReadTokens: 9000,
        cacheWriteTokens: 9000,
        toolRoundTrips: 1,
      },
    });
  });

  test("splitting the tokens off leaves only the decision", async () => {
    model.script({ text: "O corte custa R$ 80.", usage: { inputTokens: 10, outputTokens: 4 } });

    const { decision, tokens } = splitTokens(
      await createBotCore({ model, repository, clock }).respond(turn),
    );

    expect(decision).toEqual({ kind: "answer", reply: "O corte custa R$ 80." });
    expect(tokens).toMatchObject({ inputTokens: 10, outputTokens: 4 });
  });
});

const captureCall = (input: unknown, id = "call-1") => ({
  id,
  name: "capture_contact_details",
  input,
});

describe("Contact capture", () => {
  const capturing = (fields: Partial<CaptureSettings["fields"]>): CaptureSettings => ({
    enabled: true,
    fields: { ...disabledCapture.fields, ...fields },
  });

  test("offers the capture tool with only the fields the Tenant chose, and none when disabled", async () => {
    repository.capture = capturing({ name: "required", need: "optional" });
    model.script({ text: "Oi!" });
    await core().respond(turn);

    repository.capture = { ...repository.capture, enabled: false };
    model.script({ text: "Oi!" });
    await core().respond(turn);

    const [enabled, disabled] = model.requests;
    expect(enabled.tools.map((tool) => tool.name)).toEqual(["handoff", "capture_contact_details"]);
    const schema = enabled.tools[1].inputSchema as { properties: Record<string, unknown> };
    expect(Object.keys(schema.properties)).toEqual(["name", "need"]);
    expect(disabled.tools.map((tool) => tool.name)).toEqual(["handoff"]);
  });

  test("stores what the Contact stated on the turn's Contact, trimmed, and replies", async () => {
    repository.capture = capturing({ name: "optional", need: "optional" });
    repository.messages = [fromContact("Sou a Ana, quero cortar o cabelo")];
    model.script({
      text: "Prazer, Ana! O corte custa R$ 80.",
      toolCalls: [captureCall({ name: " Ana ", need: "Cortar o cabelo" })],
    });

    expect(await core().respond(turn)).toEqual({
      kind: "answer",
      reply: "Prazer, Ana! O corte custa R$ 80.",
    });
    expect(repository.captured).toEqual([{ name: "Ana", need: "Cortar o cabelo" }]);
  });

  test("a capture without a reply returns the result to the model once for its reply", async () => {
    repository.capture = capturing({ email: "required" });
    repository.messages = [fromContact("Meu e-mail é ana@example.com")];
    model.script(
      { toolCalls: [captureCall({ email: "ana@example.com" })] },
      { text: "Obrigado, anotei seu e-mail." },
    );

    expect(await core().respond(turn)).toEqual({
      kind: "answer",
      reply: "Obrigado, anotei seu e-mail.",
    });
    expect(repository.captured).toEqual([{ email: "ana@example.com" }]);
    expect(model.requests[1].messages.slice(-2)).toEqual([
      { role: "assistant", text: "", toolCalls: [captureCall({ email: "ana@example.com" })] },
      {
        role: "tool",
        results: [{ callId: "call-1", name: "capture_contact_details", output: "Saved." }],
      },
    ]);
    expect(tokens!.toolRoundTrips).toBe(1);
  });

  test.each([
    [
      "the capability is disabled",
      { ...disabledCapture.fields, name: "required" },
      false,
      { name: "Ana" },
    ],
    [
      "the Tenant did not choose the field",
      { ...disabledCapture.fields, name: "required" },
      true,
      { city: "Santos" },
    ],
    [
      "the email is malformed",
      { ...disabledCapture.fields, email: "optional" },
      true,
      { email: "ana@" },
    ],
    ["a value is blank", { ...disabledCapture.fields, name: "optional" }, true, { name: "  " }],
    ["no detail is sent", { ...disabledCapture.fields, name: "optional" }, true, {}],
    [
      "the name is too long",
      { ...disabledCapture.fields, name: "optional" },
      true,
      { name: "A".repeat(101) },
    ],
    [
      "it names another Contact",
      { ...disabledCapture.fields, name: "optional" },
      true,
      { name: "Ana", contactId: "contact-b", tenantId: "tenant-b" },
    ],
  ] as const)(
    "a capture is refused, retried and stores nothing when %s",
    async (_case, fields, enabled, input) => {
      repository.capture = { enabled, fields };
      model.script({ toolCalls: [captureCall(input)] }, { text: "Como posso ajudar?" });

      expect(await core().respond(turn)).toEqual({ kind: "answer", reply: "Como posso ajudar?" });
      expect(repository.captured).toEqual([]);
      expect(model.requests[1].messages.at(-1)).toMatchObject({
        role: "tool",
        results: [{ callId: "call-1", name: "capture_contact_details", error: expect.any(String) }],
      });
    },
  );

  test("a valid capture beside an invalid call is not stored", async () => {
    repository.capture = capturing({ name: "optional" });
    model.script(
      { toolCalls: [captureCall({ name: "Ana" }), handoffCall("talvez")] },
      new Error("500"),
    );

    expect(await core().respond(turn)).toMatchObject({
      kind: "handoff",
      reason: "bot_indisponivel",
    });
    expect(repository.captured).toEqual([]);
  });

  test("injects the Contact's chosen details apart from the cached prefix, never the phone", async () => {
    repository.capture = capturing({ name: "required", email: "required", need: "optional" });
    repository.contact = { name: "Ana", email: null, city: "Santos", need: null };
    model.script({ text: "Oi, Ana!" }, { text: "Oi, Bia!" });

    await core().respond(turn);
    repository.contact = { ...repository.contact, name: "Bia" };
    await core().respond(turn);

    const [first, second] = model.requests;
    expect(first.contact).toBe(
      [
        "# Contact details",
        "Name: Ana",
        "Email: not provided (required before a handoff)",
        "Need: not provided",
      ].join("\n"),
    );
    expect(second.contact).toContain("Name: Bia");
    expect(second.instructions).toBe(first.instructions);
    expect(first.instructions).toContain(
      "# Contact details to capture\n- Name: required\n- Email: required\n- Need: optional",
    );
    expect(first.instructions).not.toContain("Ana");
    expect(first.knowledgeBase).not.toContain("Ana");
  });

  describe("required details before a Handoff", () => {
    const askNameAndEmail =
      "Antes de chamar a equipe, me informe seu nome e seu e-mail, por favor.";

    beforeEach(() => {
      repository.capture = capturing({ name: "required", email: "required", need: "optional" });
      repository.messages = [fromContact("Quanto custa o corte? Quero falar com alguém")];
    });

    test("asks only for the missing required details instead of handing off", async () => {
      model.script({
        text: "O corte custa R$ 80.",
        toolCalls: [handoffCall("pedido_do_contato")],
      });

      expect(await core().respond(turn)).toEqual({
        kind: "answer",
        reply: `O corte custa R$ 80.\n\n${askNameAndEmail}`,
      });
    });

    test("hands off anyway when the Contact does not give them after the request", async () => {
      repository.messages = [
        fromContact("Quero falar com alguém", minutesAgo(3)),
        { author: "bot", text: askNameAndEmail, sentAt: minutesAgo(2) },
        fromContact("Prefiro não informar"),
      ];
      model.script({ toolCalls: [handoffCall("pedido_do_contato")] });

      expect(await core().respond(turn)).toEqual({
        kind: "handoff",
        reason: "pedido_do_contato",
        reply: "Certo, vou chamar alguém da equipe para continuar o atendimento.",
      });
    });

    test("hands off with what the Contact gave after the request, even if partial", async () => {
      repository.messages = [
        fromContact("Quero falar com alguém", minutesAgo(3)),
        { author: "bot", text: askNameAndEmail, sentAt: minutesAgo(2) },
        fromContact("Sou a Ana, e-mail não tenho"),
      ];
      model.script({
        toolCalls: [captureCall({ name: "Ana" }), handoffCall("pedido_do_contato", {}, "call-2")],
      });

      expect(await core().respond(turn)).toMatchObject({
        kind: "handoff",
        reason: "pedido_do_contato",
      });
      expect(repository.captured).toEqual([{ name: "Ana" }]);
    });

    test("asks again for a later Handoff once the Bot has replied to something else", async () => {
      repository.messages = [
        fromContact("Quero falar com alguém", minutesAgo(5)),
        { author: "bot", text: askNameAndEmail, sentAt: minutesAgo(4) },
        fromContact("Deixa, quanto custa a barba?", minutesAgo(3)),
        { author: "bot", text: "Não tenho essa informação.", sentAt: minutesAgo(2) },
        fromContact("Então quero falar com alguém"),
      ];
      model.script({ toolCalls: [handoffCall("pedido_do_contato")] });

      expect(await core().respond(turn)).toEqual({ kind: "answer", reply: askNameAndEmail });
    });

    test("hands off once the required details are saved, whether before or in the same response", async () => {
      repository.contact = { ...noContactDetails, name: "Ana" };
      model.script({
        toolCalls: [
          captureCall({ email: "ana@example.com" }),
          handoffCall("sem_resposta", {}, "call-2"),
        ],
      });

      expect(await core().respond(turn)).toMatchObject({ kind: "handoff", reason: "sem_resposta" });
    });

    test("does not ask for optional details", async () => {
      repository.contact = { ...noContactDetails, name: "Ana", email: "ana@example.com" };
      model.script({ toolCalls: [handoffCall("regra_do_negocio")] });

      expect(await core().respond(turn)).toMatchObject({
        kind: "handoff",
        reason: "regra_do_negocio",
      });
    });

    test("does not ask while capture is disabled", async () => {
      repository.capture = { ...repository.capture, enabled: false };
      model.script({ toolCalls: [handoffCall("pedido_do_contato")] });

      expect(await core().respond(turn)).toMatchObject({
        kind: "handoff",
        reason: "pedido_do_contato",
      });
    });

    test("does not delay a Handoff when the Bot is unavailable", async () => {
      model.script(new Error("529 overloaded"));

      expect(await core().respond(turn)).toMatchObject({
        kind: "handoff",
        reason: "bot_indisponivel",
      });
    });
  });

  test("sends no Contact details or capture instructions while capture is disabled", async () => {
    repository.contact = { name: "Ana", email: "ana@example.com", city: null, need: null };
    model.script({ text: "Oi!" });

    await core().respond(turn);

    expect(model.requests[0].contact).toBe("");
    expect(JSON.stringify(model.requests[0])).not.toContain("Ana");
    expect(model.requests[0].instructions).not.toContain("capture");
  });
});
