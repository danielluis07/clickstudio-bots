import Link from "next/link";
import { MessageCircleIcon } from "lucide-react";
import { ChannelSignalDot } from "@/components/channels/channel-signal-dot";
import type { ChannelSignal } from "@/modules/channels";

export function ChannelStatusPill({
  displayPhoneNumber,
  signal,
}: {
  displayPhoneNumber: string;
  signal: ChannelSignal;
}) {
  return (
    <Link
      href="/painel/configuracoes#canal"
      title={`WhatsApp Business: ${displayPhoneNumber}`}
      className="inline-flex h-8 items-center gap-2 rounded-full border border-border px-2.5 text-sm whitespace-nowrap outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <MessageCircleIcon className="size-4 shrink-0" aria-hidden="true" />
      <ChannelSignalDot signal={signal} />
      <span className="sr-only sm:not-sr-only">{displayPhoneNumber}</span>
    </Link>
  );
}
