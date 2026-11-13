import { DashboardRailSection } from "@/components/dashboard/dashboard-rail-section";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Message, MessageContent, MessageHeader } from "@/components/ui/message";
import { businessIntroduction, type BusinessProfileDraft } from "@/modules/bot/hooks";

// How the Bot might introduce the business, following the unsaved form.
export function BusinessProfilePreview({ draft }: { draft: BusinessProfileDraft }) {
  return (
    <div className="lg:sticky lg:top-0">
      <DashboardRailSection title="Prévia">
        <p className="-mt-1 text-xs text-muted-foreground">
          Um exemplo de como o Bot usa o perfil quando um contato pergunta. Muda enquanto você
          edita.
        </p>
        <div className="flex flex-col gap-3 rounded-lg border bg-background p-3">
          <Message align="end">
            <MessageContent>
              <MessageHeader>Contato</MessageHeader>
              <Bubble align="end">
                <BubbleContent>Oi! Que horas vocês abrem? Onde fica?</BubbleContent>
              </Bubble>
            </MessageContent>
          </Message>
          <Message>
            <MessageContent>
              <MessageHeader>Bot</MessageHeader>
              <Bubble variant="secondary" className="max-w-[90%]">
                <BubbleContent className="whitespace-pre-wrap">
                  {businessIntroduction(draft)}
                </BubbleContent>
              </Bubble>
            </MessageContent>
          </Message>
        </div>
      </DashboardRailSection>
    </div>
  );
}
