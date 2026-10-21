"use client";

import { LogOutIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { useConfirm } from "@/providers/confirm-provider";
import { signOutAction } from "@/server/actions/session";

export function SignOutButton({ inSidebar = false }: { inSidebar?: boolean }) {
  const { confirm } = useConfirm();

  function handleSignOut() {
    confirm({
      title: "Sair da conta?",
      message: "Você precisará entrar novamente para acessar o aplicativo.",
      action: signOutAction,
    });
  }

  if (inSidebar) {
    return (
      <SidebarMenuButton type="button" tooltip="Sair" aria-label="Sair" onClick={handleSignOut}>
        <LogOutIcon aria-hidden="true" />
        <span>Sair</span>
      </SidebarMenuButton>
    );
  }

  return (
    <Button type="button" variant="outline" onClick={handleSignOut}>
      Sair
    </Button>
  );
}
