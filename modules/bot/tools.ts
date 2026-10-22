import { z } from "zod";
import { captureInput, capturedFields, type CaptureSettings } from "@/modules/bot/capture";
import type { ModelTool, ModelToolCall, ModelToolRefusal } from "@/modules/bot/model";
import type { ContactDetails } from "@/modules/conversations";

export const captureToolName = "capture_contact_details";

// Why the Bot stepped aside. The model chooses among these;
// "bot_indisponivel" is the core's own, after a provider or tool failure.
const modelHandoffReasons = ["sem_resposta", "pedido_do_contato", "regra_do_negocio"] as const;

export type HandoffReason = (typeof modelHandoffReasons)[number] | "bot_indisponivel";

// Every Handoff reply ends with one of these, so the Contact always learns
// the team will reply, whatever the model wrote.
const handoffNotices: Record<HandoffReason, string> = {
  sem_resposta: "Não tenho essa informação, vou chamar alguém da equipe.",
  pedido_do_contato: "Certo, vou chamar alguém da equipe para continuar o atendimento.",
  regra_do_negocio: "Vou passar seu atendimento para a equipe, que responderá em breve.",
  bot_indisponivel: "No momento não consigo responder, vou chamar alguém da equipe.",
};

// After the answerable part of a mixed question.
const remainderNotice = "Sobre o restante, vou chamar alguém da equipe.";

export const handoffReply = (reason: HandoffReason, answered: string) => {
  if (!answered) return handoffNotices[reason];
  return `${answered}\n\n${reason === "sem_resposta" ? remainderNotice : handoffNotices[reason]}`;
};

const handoffInput = z.object({
  reason: z
    .enum(modelHandoffReasons)
    .describe(
      "sem_resposta: the Knowledge base lacks the answer or contradicts itself. " +
        "pedido_do_contato: the Contact asked for a person. " +
        "regra_do_negocio: a topic the business hands to its team.",
    ),
});

type OfferedTool = { name: string; description: string; input: z.ZodType };

// The catalog tools this Tenant's Bot offers; a call to any other name is
// refused. Inputs carry no Tenant, Conversation or Contact: the core applies
// the turn's own.
const offeredTools = (capture: CaptureSettings): OfferedTool[] => [
  {
    name: "handoff",
    description: "Pass the Conversation to the business's team, who will reply to the Contact.",
    input: handoffInput,
  },
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

export const modelTools = (capture: CaptureSettings): ModelTool[] =>
  offeredTools(capture).map(({ name, description, input }) => ({
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
    }
  | { valid: false; errors: ModelToolRefusal[] };

// Validates calls server-side whatever the provider checked. A response with
// any invalid call is refused whole, so a valid call beside it does not run.
export const checkToolCalls = (calls: ModelToolCall[], capture: CaptureSettings): CheckedCalls => {
  const tools = offeredTools(capture);
  const checked = calls.map((call): { call: ModelToolCall; input?: unknown; error?: string } => {
    const tool = tools.find(({ name }) => name === call.name);
    if (!tool) return { call, error: `Tool "${call.name}" is not available.` };
    const parsed = tool.input.safeParse(call.input);
    return parsed.success
      ? { call, input: parsed.data }
      : { call, error: `Invalid input: ${z.prettifyError(parsed.error)}` };
  });
  if (checked.every((result) => !result.error)) {
    const handoff = checked.find(({ call }) => call.name === "handoff");
    const captures = checked.filter(({ call }) => call.name === captureToolName);
    return {
      valid: true,
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
