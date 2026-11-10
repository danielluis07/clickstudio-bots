import { ChannelHealthNotice } from "@/components/channels/channel-health-notice";
import { HistoryNotImportedNotice } from "@/components/channels/history-not-imported-notice";
import { RetrySubscriptionButton } from "@/components/channels/retry-subscription-button";
import type { ChannelSummary } from "@/modules/channels";

export function ConnectedChannel({
  channel,
  isOwner,
}: {
  channel: ChannelSummary;
  isOwner: boolean;
}) {
  const healthy = channel.health === "healthy";
  return (
    <div className="flex flex-col gap-3">
      <p className="font-medium">WhatsApp Business: {channel.displayPhoneNumber}</p>
      <p>
        {channel.botEnabled ? (channel.botPaused ? "Bot pausado" : "Bot ligado") : "Bot desligado"}
      </p>
      <ChannelHealthNotice channel={channel} isOwner={isOwner} />
      {channel.historyNotImported && <HistoryNotImportedNotice />}
      {channel.subscriptionStatus === "subscribed" ? (
        healthy && (
          <p className="text-sm text-muted-foreground">
            Canal conectado e recebimento de eventos confirmado.
          </p>
        )
      ) : (
        <>
          <p role="status" className="text-sm text-muted-foreground">
            O Canal foi salvo, mas o recebimento de eventos ainda não foi confirmado. O Bot
            permanece desligado.
          </p>
          {isOwner && !channel.canReconnect && <RetrySubscriptionButton />}
        </>
      )}
    </div>
  );
}
