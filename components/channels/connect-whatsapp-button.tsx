"use client";

import Script from "next/script";
import type { EmbeddedSignupConfig } from "@/components/channels/embedded-signup";
import { useEmbeddedSignup } from "@/components/channels/use-embedded-signup";
import { FormMessage } from "@/components/forms/form-message";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function ConnectWhatsAppButton({ config }: { config: EmbeddedSignupConfig }) {
  const signup = useEmbeddedSignup(config);
  return (
    <div className="flex flex-col items-start gap-3">
      <Script src="https://connect.facebook.net/pt_BR/sdk.js" strategy="afterInteractive" onReady={signup.initialize} onError={signup.scriptFailed} />
      <Button type="button" onClick={signup.launch} disabled={!signup.ready || signup.busy}>
        {signup.busy && <Spinner data-icon="inline-start" />}
        {signup.busy ? "Conectando…" : signup.ready ? "Conectar WhatsApp Business" : "Carregando conexão…"}
      </Button>
      <FormMessage state={signup.state} />
    </div>
  );
}
