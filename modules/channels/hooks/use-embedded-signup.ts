"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useTRPC } from "@/trpc/client";
import {
  parseSignupSession,
  type EmbeddedSignupConfig,
} from "@/modules/channels/hooks/embedded-signup";
import type { ChannelSignup } from "@/modules/channels/service";

type SignupState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; message: string };

type CompleteSignup = (input: ChannelSignup) => Promise<SignupState>;

type SignupAttempt = {
  code?: string;
  wabaId?: string;
  phoneNumberId?: string;
  submitted: boolean;
  timer?: ReturnType<typeof setTimeout>;
};

export const useEmbeddedSignup = (config: EmbeddedSignupConfig, completeSignup: CompleteSignup) => {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<SignupState>({ status: "idle" });
  const [, startTransition] = useTransition();
  const active = useRef<SignupAttempt | null>(null);
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const fail = useCallback((message: string) => {
    if (active.current) clearTimeout(active.current.timer);
    active.current = null;
    setBusy(false);
    setState({ status: "error", message });
  }, []);

  const submitWhenReady = useCallback(
    (attempt: SignupAttempt) => {
      if (active.current !== attempt || attempt.submitted) return;
      if (!attempt.code || !attempt.wabaId) {
        // Do not time out while the owner is still navigating Meta's popup.
        // Only bound the wait for the complementary result after completion.
        attempt.timer ??= setTimeout(
          () =>
            fail(
              "A Meta não confirmou todos os dados da conexão. Atualize a página e tente novamente.",
            ),
          60_000,
        );
        return;
      }
      attempt.submitted = true;
      clearTimeout(attempt.timer);
      // Only the short-lived code crosses to the server. The SDK is configured
      // to return a code; business tokens are never obtained in the browser.
      const input = {
        code: attempt.code,
        wabaId: attempt.wabaId,
        phoneNumberId: attempt.phoneNumberId,
      };
      attempt.code = undefined;
      startTransition(async () => {
        try {
          const result = await completeSignup(input);
          setState(result);
          // The header and the Bot checklist read the Channel on the client.
          if (result.status === "success") {
            void queryClient.invalidateQueries(trpc.channels.pathFilter());
            void queryClient.invalidateQueries(trpc.bot.status.pathFilter());
          }
        } catch {
          setState({
            status: "error",
            message:
              "Não foi possível confirmar a conexão. Atualize a página antes de tentar novamente.",
          });
        } finally {
          active.current = null;
          setBusy(false);
        }
      });
    },
    [completeSignup, fail, queryClient, trpc],
  );

  useEffect(() => {
    const receiveSession = (event: MessageEvent) => {
      const attempt = active.current;
      if (!attempt || attempt.submitted) return;
      const session = parseSignupSession(event);
      if (!session) return;
      if (session.event === "CANCEL" || session.event === "ERROR") {
        fail("A conexão não foi concluída na Meta. Você pode tentar novamente.");
      } else if (
        session.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING" &&
        session.data?.waba_id
      ) {
        attempt.wabaId = session.data.waba_id;
        attempt.phoneNumberId = session.data.phone_number_id;
        submitWhenReady(attempt);
      } else if (session.event.startsWith("FINISH")) {
        fail("Selecione a opção de conectar um número que você já usa no app WhatsApp Business.");
      }
    };
    window.addEventListener("message", receiveSession);
    return () => {
      window.removeEventListener("message", receiveSession);
      if (active.current) clearTimeout(active.current.timer);
      active.current = null;
    };
  }, [fail, submitWhenReady]);

  const initialize = () => {
    if (!window.FB) return;
    window.FB.init({
      appId: config.appId,
      version: config.graphVersion,
      autoLogAppEvents: false,
      xfbml: false,
    });
    setReady(true);
  };

  const launch = () => {
    if (!ready || !window.FB || active.current) return;
    setState({ status: "idle" });
    setBusy(true);
    const attempt: SignupAttempt = { submitted: false };
    active.current = attempt;
    try {
      // Remains synchronous with the click so browsers allow the Meta popup.
      window.FB.login(
        (response) => {
          if (active.current !== attempt || attempt.submitted) return;
          const code = response.authResponse?.code;
          if (!code) return fail("A conexão não foi autorizada. Você pode tentar novamente.");
          attempt.code = code;
          submitWhenReady(attempt);
        },
        {
          config_id: config.configId,
          response_type: "code",
          override_default_response_type: true,
          extras: {
            setup: {},
            featureType: "whatsapp_business_app_onboarding",
            sessionInfoVersion: "3",
          },
        },
      );
    } catch {
      fail(
        "Não foi possível abrir a conexão com a Meta. Verifique se o navegador permite pop-ups e tente novamente.",
      );
    }
  };

  return {
    ready,
    busy,
    state,
    initialize,
    launch,
    scriptFailed: () =>
      fail("Não foi possível carregar a Meta. Atualize a página e tente novamente."),
  };
};
