"use client";

import { useState } from "react";
import { XIcon } from "lucide-react";
import { ConnectWhatsAppButton } from "@/components/channels/connect-whatsapp-button";
import { WhatsAppInstructions } from "@/components/channels/whatsapp-instructions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { RouterOutput } from "@/trpc/routers/_app";

type ChannelStatus = RouterOutput["channels"]["status"];

// The Channel's connect and reconnect flow, opened from the dashboard header
// and the Bot checklist.
export function ConnectChannelDialog({
  status,
  open,
  onOpenChange,
}: {
  status: ChannelStatus;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    // Meta's signup runs in a popup; a stray click outside must not drop it.
    <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
        showCloseButton={false}
      >
        <ConnectChannelBody status={status} />
        <DialogClose
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-2 right-2"
            />
          }
        >
          <XIcon />
          <span className="sr-only">Fechar</span>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

function ConnectChannelBody({ status }: { status: ChannelStatus }) {
  // Mounted while the dialog is open. The status it opened with is kept, so a
  // successful signup, which refetches the status, still shows its message.
  const [opened] = useState(status);
  const reconnect = Boolean(opened.channel);
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {reconnect ? "Reconectar WhatsApp Business" : "Conectar WhatsApp Business"}
        </DialogTitle>
        <DialogDescription>
          {reconnect
            ? "Conclua a conexão na Meta com o mesmo número. As conversas e o histórico continuam no painel."
            : "Use seu WhatsApp Business com o ClickStudio Bots."}
        </DialogDescription>
      </DialogHeader>
      {!reconnect && <WhatsAppInstructions />}
      {opened.signup ? (
        <ConnectWhatsAppButton config={opened.signup} reconnect={reconnect} />
      ) : (
        <p className="text-sm text-muted-foreground">
          A conexão com o WhatsApp ainda não está disponível. Entre em contato com o suporte.
        </p>
      )}
    </>
  );
}
