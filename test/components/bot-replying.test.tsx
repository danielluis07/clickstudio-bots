import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BotReplyingIndicator } from "@/components/inbox/bot-replying-indicator";
import { ConversationListPreview } from "@/components/inbox/conversation-list-preview";

const inAMinute = () => new Date(Date.now() + 60_000);
const aSecondAgo = () => new Date(Date.now() - 1_000);

const preview = (botReplyingUntil: Date | null) =>
  renderToStaticMarkup(
    <ConversationListPreview
      conversation={{
        botReplyingUntil,
        lastMessage: { type: "text", text: "Quanto custa?", revoked: false },
      }}
    />,
  );

describe("Bot replying indicator", () => {
  test("the thread says the Bot is typing until the time the server gave", () => {
    const shown = renderToStaticMarkup(<BotReplyingIndicator until={inAMinute()} />);
    expect(shown).toContain("Bot digitando…");
    expect(shown).toContain('role="status"');
    expect(renderToStaticMarkup(<BotReplyingIndicator until={aSecondAgo()} />)).toBe("");
    expect(renderToStaticMarkup(<BotReplyingIndicator until={null} />)).toBe("");
  });

  test("the list shows the Bot typing in place of the latest message while it replies", () => {
    const replying = preview(inAMinute());
    expect(replying).toContain("Bot digitando…");
    expect(replying).not.toContain("Quanto custa?");
    const idle = preview(aSecondAgo());
    expect(idle).not.toContain("Bot digitando…");
    expect(idle).toContain("Quanto custa?");
    expect(preview(null)).toContain("Quanto custa?");
  });
});
