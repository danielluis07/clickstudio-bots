import { z } from "zod";
import { captureInput, capturedFields, type CaptureSettings } from "@/modules/bot/capture";
import {
  availableLinks,
  configuredLinkReply,
  type ConfiguredLink,
  type LinkSettings,
} from "@/modules/bot/links";
import type { ModelTool, ModelToolCall, ModelToolRefusal } from "@/modules/bot/model";
import type { ContactDetails, ConversationHandoffReason } from "@/modules/conversations";

export const captureToolName = "capture_contact_details";
export const linkToolName = "send_configured_link";

// Why the Bot stepped aside, among the reasons a Handoff stores. The model
// chooses among these; "bot_unavailable" is the core's own, after a provider
// or tool failure.
const modelHandoffReasons = [
  "no_answer",
  "contact_request",
  "handoff_topic",
] as const satisfies readonly ConversationHandoffReason[];

export type HandoffReason =
  (typeof modelHandoffReasons)[number] | Extract<ConversationHandoffReason, "bot_unavailable">;

// Every Handoff reply ends with one of these, so the Contact always learns
// the team will reply, whatever the model wrote.
const handoffNotices: Record<HandoffReason, string> = {
  no_answer: "Não tenho essa informação, vou chamar alguém da equipe.",
  contact_request: "Certo, vou chamar alguém da equipe para continuar o atendimento.",
  handoff_topic: "Vou passar seu atendimento para a equipe, que responderá em breve.",
  bot_unavailable: "No momento não consigo responder, vou chamar alguém da equipe.",
};

// After the answerable part of a mixed question.
const remainderNotice = "Sobre o restante, vou chamar alguém da equipe.";

export const handoffReply = (reason: HandoffReason, answered: string) => {
  if (!answered) return handoffNotices[reason];
  return `${answered}\n\n${reason === "no_answer" ? remainderNotice : handoffNotices[reason]}`;
};

const handoffInput = z.object({
  reason: z
    .enum(modelHandoffReasons)
    .describe(
      "no_answer: the Knowledge base lacks the answer or contradicts itself. " +
        "contact_request: the Contact asked for a person. " +
        "handoff_topic: a topic the business hands to its team.",
    ),
});

type OfferedTool = { name: string; description: string; input: z.ZodType };

// The catalog tools this Tenant's Bot offers; a call to any other name is
// refused. Inputs carry no Tenant, Conversation or Contact: the core applies
// the turn's own.
const offeredTools = (capture: CaptureSettings, links: LinkSettings): OfferedTool[] => [
  {
    name: "handoff",
    description: "Pass the Conversation to the business's team, who will reply to the Contact.",
    input: handoffInput,
  },
  ...(availableLinks(links).length
    ? [
        {
          name: linkToolName,
          description:
            "Send a configured business link. This never books anything, makes a payment, confirms status, or fetches a URL. Select only its configured id.",
          input: z.strictObject({ linkId: z.enum(availableLinks(links).map(({ id }) => id)) }),
        },
      ]
    : []),
  ...(capturedFields(capture).length
    ? [
        {
          name: captureToolName,
          description:
            "Save details the Contact stated about themselves, so the business's team has them.",
          input: captureInput(capture),
        },
      ]
    : []),
];

export const modelTools = (capture: CaptureSettings, links: LinkSettings): ModelTool[] =>
  offeredTools(capture, links).map(({ name, description, input }) => ({
    name,
    description,
    inputSchema: z.toJSONSchema(input),
  }));

export type CheckedCalls =
  | {
      valid: true;
      handoff: z.output<typeof handoffInput> | null;
      // Every detail the response captured, later calls winning.
      captured: Partial<ContactDetails> | null;
      links: ConfiguredLink[];
    }
  | { valid: false; errors: ModelToolRefusal[] };

// Validates calls server-side whatever the provider checked. A response with
// any invalid call is refused whole, so a valid call beside it does not run.
export const checkToolCalls = (
  calls: ModelToolCall[],
  capture: CaptureSettings,
  links: LinkSettings,
): CheckedCalls => {
  const tools = offeredTools(capture, links);
  const checked = calls.map((call): { call: ModelToolCall; input?: unknown; error?: string } => {
    const tool = tools.find(({ name }) => name === call.name);
    if (!tool) return { call, error: `Tool "${call.name}" is not available.` };
    const parsed = tool.input.safeParse(call.input);
    return parsed.success
      ? { call, input: parsed.data }
      : { call, error: `Invalid input: ${z.prettifyError(parsed.error)}` };
  });
  const selected = new Set(
    checked
      .filter(({ call, error }) => call.name === linkToolName && !error)
      .map(({ input }) => (input as { linkId: string }).linkId),
  );
  const selectedLinks = availableLinks(links).filter(({ id }) => selected.has(id));
  // Keep complete URLs and reserve 256 characters for a Handoff or required-detail
  // notice within WhatsApp's 4,096-character text limit. Refuse before any capture.
  if (selectedLinks.length && configuredLinkReply(selectedLinks).length > 4096 - 256) {
    for (const item of checked) {
      if (item.call.name === linkToolName)
        item.error = "Selected links exceed the reply length limit. Select fewer links.";
    }
  }
  if (checked.every((result) => !result.error)) {
    const handoff = checked.find(({ call }) => call.name === "handoff");
    const captures = checked.filter(({ call }) => call.name === captureToolName);
    return {
      valid: true,
      links: selectedLinks,
      handoff: (handoff?.input as z.output<typeof handoffInput> | undefined) ?? null,
      captured: captures.length
        ? Object.assign({}, ...captures.map(({ input }) => input as Partial<ContactDetails>))
        : null,
    };
  }
  return {
    valid: false,
    errors: checked.map(({ call, error }) => ({
      callId: call.id,
      name: call.name,
      error: error ?? "Not run: another call in this response was invalid. Call again.",
    })),
  };
};
