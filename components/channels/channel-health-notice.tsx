import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatDateTime } from "@/lib/format";
import type { ChannelSummary } from "@/modules/channels";

const reconnectStep = {
  owner:
    "Clique em Reconectar WhatsApp Business abaixo e conclua a conexão na Meta com o mesmo número. As conversas e o histórico continuam no painel.",
  member: "Peça ao responsável pelo negócio para reconectar o Canal no painel.",
} as const;

export function ChannelHealthNotice({
  channel,
  isOwner,
}: {
  channel: Pick<ChannelSummary, "health" | "restrictedUntil">;
  isOwner: boolean;
}) {
  if (channel.health === "healthy") return null;
  const step = reconnectStep[isOwner ? "owner" : "member"];
  return (
    <Alert variant="destructive">
      {channel.health === "credential_rejected" && (
        <>
          <AlertTitle>Canal sem acesso ao WhatsApp</AlertTitle>
          <AlertDescription>
            A Meta recusou o acesso do ClickStudio Bots a este número, por exemplo porque a
            permissão expirou ou foi removida. O Bot não responde até o Canal ser reconectado.{" "}
            {step}
          </AlertDescription>
        </>
      )}
      {channel.health === "removed" && (
        <>
          <AlertTitle>Canal desconectado na Meta</AlertTitle>
          <AlertDescription>
            O ClickStudio Bots foi removido da conta do WhatsApp Business deste número. O Bot não
            responde até o Canal ser reconectado. {step}
          </AlertDescription>
        </>
      )}
      {channel.health === "banned" && (
        <>
          <AlertTitle>Conta do WhatsApp Business desativada</AlertTitle>
          <AlertDescription>
            A Meta desativou a conta do WhatsApp Business deste número. O Bot não responde enquanto
            ela estiver desativada e volta sozinho quando a Meta reativá-la. Veja o motivo e como
            recorrer no Gerenciador do WhatsApp, na Meta.
          </AlertDescription>
        </>
      )}
      {channel.health === "restricted" && (
        <>
          <AlertTitle>Respostas restringidas pela Meta</AlertTitle>
          <AlertDescription>
            {channel.restrictedUntil
              ? `A Meta restringiu as respostas deste número até ${formatDateTime(channel.restrictedUntil)}. O Bot volta a responder quando a restrição terminar.`
              : "A Meta restringiu as respostas deste número. O Bot não responde enquanto a restrição durar."}{" "}
            Veja o motivo no Gerenciador do WhatsApp, na Meta.
          </AlertDescription>
        </>
      )}
    </Alert>
  );
}
