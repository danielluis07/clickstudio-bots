"use client";

import { useState } from "react";
import { MessageCircleIcon } from "lucide-react";
import { ChannelSignalDot } from "@/components/channels/channel-signal-dot";
import { ChannelStatusPill } from "@/components/channels/channel-status-pill";
import { ConnectChannelDialog } from "@/components/channels/connect-channel-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useChannelStatus } from "@/modules/channels/hooks";

// The dashboard header's Channel status: the owner's connect or reconnect
// action, otherwise the number and its health.
export function ChannelStatus() {
  const { data: status, isPending, isError } = useChannelStatus();
  const [open, setOpen] = useState(false);

  if (isPending)
    return (
      <Skeleton
        className="h-8 w-14 shrink-0 rounded-full sm:w-44"
        aria-busy="true"
        aria-label="Carregando Canal do WhatsApp"
      />
    );
  if (isError) return null;

  const { channel } = status;
  return (
    <>
      {status.canConnect ? (
        <Button
          type="button"
          onClick={() => setOpen(true)}
          className={
            channel
              ? "rounded-full border-amber-500/50 bg-amber-500/10 text-amber-800 hover:bg-amber-500/20 dark:text-amber-300"
              : undefined
          }
        >
          <MessageCircleIcon aria-hidden="true" />
          {channel && <ChannelSignalDot signal={channel.signal} />}
          <span className="sr-only sm:not-sr-only">
            {channel ? "Reconectar WhatsApp" : "Conectar WhatsApp Business"}
          </span>
        </Button>
      ) : channel ? (
        <ChannelStatusPill displayPhoneNumber={channel.displayPhoneNumber} signal={channel.signal} />
      ) : (
        <span className="inline-flex h-8 items-center gap-2 text-sm whitespace-nowrap text-muted-foreground">
          <MessageCircleIcon className="size-4 shrink-0" aria-hidden="true" />
          <ChannelSignalDot signal="none" />
          <span className="sr-only sm:not-sr-only">WhatsApp não conectado</span>
        </span>
      )}
      {/* Stays open after a successful signup turns the action into the pill. */}
      {(status.canConnect || open) && (
        <ConnectChannelDialog status={status} open={open} onOpenChange={setOpen} />
      )}
    </>
  );
}
