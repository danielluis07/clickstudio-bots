import { ConnectWhatsAppButton } from "@/components/channels/connect-whatsapp-button";
import { ConnectedChannel } from "@/components/channels/connected-channel";
import { WhatsAppInstructions } from "@/components/channels/whatsapp-instructions";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { TenantScope } from "@/modules/tenancy";
import { channelService } from "@/server/services";
import { getWhatsAppSignupConfig } from "@/server/whatsapp";

export async function WhatsAppChannel({ scope }: { scope: TenantScope }) {
  const channel = await channelService.getChannel(scope);
  const isOwner = scope.role === "owner";
  const config = isOwner && !channel ? getWhatsAppSignupConfig() : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Canal do WhatsApp</CardTitle>
        <CardDescription>Use seu WhatsApp Business com o ClickStudio Bots.</CardDescription>
      </CardHeader>
      <CardContent>
        {channel ? (
          <ConnectedChannel channel={channel} isOwner={isOwner} />
        ) : isOwner ? (
          <WhatsAppInstructions />
        ) : (
          <p className="text-sm text-muted-foreground">
            O responsável pelo negócio precisa conectar o Canal do WhatsApp.
          </p>
        )}
      </CardContent>
      {!channel && isOwner && (
        <CardFooter>
          {config ? (
            <ConnectWhatsAppButton config={config} />
          ) : (
            <p className="text-sm text-muted-foreground">
              A conexão com o WhatsApp ainda não está disponível. Entre em contato com o suporte.
            </p>
          )}
        </CardFooter>
      )}
    </Card>
  );
}
