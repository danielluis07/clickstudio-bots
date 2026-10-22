# Phone inbox

Issue: [#67](https://github.com/danielluis07/clickstudio-bots/issues/67).

Below 1024px, the inbox shows either the Conversation list or the selected
Conversation. **Voltar às conversas** clears only `conversa` from the URL, keeping
the search (`busca`) and waiting filter (`filtro`). It also remains available
while a Conversation loads or cannot be opened. Browser back/forward and direct
links continue to use the URL selection.

From 1024px, the list and Conversation appear side by side. From 1280px, Contact
details occupy a third column. On narrower screens, **Contato** opens those same
details in a Sheet, including the existing permission-gated deletion control.

The inbox height follows the dynamic viewport below the dashboard header.
Messages scroll independently of the Conversation header and reply composer.
Long Contact names truncate, message text wraps even without spaces, and Handoff
actions wrap onto additional rows when necessary. The composer includes the
device's bottom safe area. Multiline replies grow up to the smaller of 10rem or
20% of the viewport height. At very short heights, the Conversation section also
scrolls so its header, messages, and composer remain reachable.

The list uses shadcn `ScrollArea`. Messages use `Message`, `Bubble`, and
`MessageScroller`, including its jump-to-latest control and preservation of the
reading position when older messages load. The older-message button sits outside
`MessageScrollerContent` so pagination controls are not mistaken for messages
when preserving the scroll position.

## Browser check

Run `bun run doctor` and prepare a local development environment as described in
[local development](local-development.md). Use a Tenant with enough Conversations
and messages to exercise scrolling and pagination.

1. At 320px and 390px widths, open `/painel/conversas`. Search by name or phone,
   choose **Aguardando equipe**, and open a Conversation. Check that the list,
   Conversation, and long names/messages produce no horizontal page scroll.
2. Check **Assumir**, **Devolver ao Bot**, and **Resolvida**. Verify that the
   ownership/waiting indicators update and the controls remain reachable.
3. Reply inside the service window. The composer must remain in view while
   messages scroll. Try a multiline draft at short viewport heights and check
   that the Handoff actions and Send button remain reachable. Confirm delivery
   separately against a configured test Channel. For a closed window, check that
   the explanation remains readable.
4. Scroll up, load older messages, and confirm the message being read stays in
   place. Use **Ir para a última mensagem** to return to the latest message.
5. Open **Contato**, edit a detail, and return to the Conversation. Check the
   Sheet's scrolling at short viewport heights and that each form label focuses
   its own input. Owners still receive the existing deletion confirmation.
6. Return to the list and check that search and filter remain selected. Exercise
   browser back/forward, a direct Conversation link, and an unavailable
   Conversation; each must still allow returning to the list.
7. Resize through 768px, 1024px, and 1440px. Check the single-panel, two-column,
   and three-column layouts, then return to phone width. Repeat with the
   history-not-imported notice and a closed service window visible.

Routine tests use fake messaging adapters. Responsive browser checks can use
synthetic Conversation data; they do not verify Meta delivery or a physical
phone's keyboard and browser chrome.
