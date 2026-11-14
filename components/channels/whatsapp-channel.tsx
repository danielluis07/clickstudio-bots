import { ConnectWhatsAppButton } from "@/components/channels/connect-whatsapp-button";
import { ConnectedChannel } from "@/components/channels/connected-channel";
import { WhatsAppInstructions } from "@/components/channels/whatsapp-instructions";
import type { TenantScope } from "@/modules/tenancy";
import { channelService } from "@/server/services";
import { getWhatsAppSignupConfig } from "@/server/whatsapp";

export async function WhatsAppChannel({ scope }: { scope: TenantScope }) {
  const channel = await channelService.getChannel(scope);
  const isOwner = scope.role === "owner";
  // The owner connects a new Channel, or reconnects one Meta stopped serving.
  const canConnect = isOwner && (!channel || channel.canReconnect);
  const config = canConnect ? getWhatsAppSignupConfig() : null;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-medium">Canal do WhatsApp</h3>
        <p className="text-sm text-muted-foreground">
          Use seu WhatsApp Business com o ClickStudio Bots.
        </p>
      </div>
      {channel ? (
        <ConnectedChannel channel={channel} isOwner={isOwner} />
      ) : isOwner ? (
        <WhatsAppInstructions />
      ) : (
        <p className="text-sm text-muted-foreground">
          O responsável pelo negócio precisa conectar o Canal do WhatsApp.
        </p>
      )}
      {canConnect && (
        <div>
          {config ? (
            <ConnectWhatsAppButton config={config} reconnect={Boolean(channel)} />
          ) : (
            <p className="text-sm text-muted-foreground">
              A conexão com o WhatsApp ainda não está disponível. Entre em contato com o suporte.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
