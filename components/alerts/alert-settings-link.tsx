import { SettingsIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

// The bell's way to the Member's Alert preferences.
export function AlertSettingsLink({ onNavigate }: { onNavigate: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Configurar notificações"
      nativeButton={false}
      render={<Link href="/painel/configuracoes#notificacoes" onClick={onNavigate} />}
    >
      <SettingsIcon aria-hidden="true" />
    </Button>
  );
}
