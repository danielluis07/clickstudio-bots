"use client";

import { useState } from "react";
import Link from "next/link";
import { ConnectChannelDialog } from "@/components/channels/connect-channel-dialog";
import { Button } from "@/components/ui/button";
import { useChannelStatus } from "@/modules/channels/hooks";

// Step 4 of "Ativar Bot": the owner connects or reconnects the Channel here.
export function BotChannelStep({ connected }: { connected: boolean }) {
  const { data: status } = useChannelStatus();
  const [open, setOpen] = useState(false);

  if (connected) return <>conectado</>;
  if (!status) return <>não conectado</>;
  return (
    <>
      {status.canConnect ? (
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 align-baseline"
          onClick={() => setOpen(true)}
        >
          {status.channel ? "Reconectar WhatsApp" : "Conectar WhatsApp"}
        </Button>
      ) : status.channel ? (
        <Link href="/painel/configuracoes#canal" className="underline">
          confira o Canal em Configurações
        </Link>
      ) : (
        "o responsável pelo negócio precisa conectar o WhatsApp"
      )}
      {(status.canConnect || open) && (
        <ConnectChannelDialog status={status} open={open} onOpenChange={setOpen} />
      )}
    </>
  );
}
