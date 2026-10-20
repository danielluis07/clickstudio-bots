import { RetrySubscriptionButton } from "@/components/channels/retry-subscription-button";
import type { ChannelSummary } from "@/modules/channels";

export function ConnectedChannel({ channel, isOwner }: { channel: ChannelSummary; isOwner: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="font-medium">WhatsApp Business: {channel.displayPhoneNumber}</p>
      <p>{channel.botEnabled ? "Bot ligado" : "Bot desligado"}</p>
      {channel.subscriptionStatus === "subscribed" ? (
        <p className="text-sm text-muted-foreground">Canal conectado e recebimento de eventos confirmado.</p>
      ) : (
        <>
          <p role="status" className="text-sm text-muted-foreground">O Canal foi salvo, mas o recebimento de eventos ainda não foi confirmado. O Bot permanece desligado.</p>
          {isOwner && <RetrySubscriptionButton />}
        </>
      )}
    </div>
  );
}
