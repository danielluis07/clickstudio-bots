"use client";

import { BotIcon } from "lucide-react";
import { DashboardNavigationGroup } from "@/components/dashboard/dashboard-navigation-group";
import { useCurrentTenant } from "@/modules/tenancy/hooks";

const pages = [
  { href: "/painel/bot", label: "Ativação" },
  { href: "/painel/bot/perfil", label: "Perfil do negócio" },
  { href: "/painel/bot/comportamento", label: "Comportamento" },
  { href: "/painel/bot/contatos-e-links", label: "Contatos e links" },
];

// Only the owner may test the Bot, so only the owner is offered "Testar".
// The page itself still refuses everyone else.
const sandbox = { href: "/painel/bot/testar", label: "Testar" };

export function DashboardBotNavigation() {
  const { data: tenant } = useCurrentTenant();
  const items = tenant?.role === "owner" ? [...pages, sandbox] : pages;

  return (
    <DashboardNavigationGroup href="/painel/bot" label="Bot" items={items}>
      <BotIcon aria-hidden="true" />
    </DashboardNavigationGroup>
  );
}
