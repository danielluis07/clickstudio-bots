"use client";

import { BotIcon } from "lucide-react";
import { DashboardNavigationGroup } from "@/components/dashboard/dashboard-navigation-group";
import { useCurrentTenant } from "@/modules/tenancy/hooks";
import { useTour } from "@/providers/tour-provider";

const activation = {
  href: "/painel/bot",
  label: "Ativação",
  tour: { id: "nav-bot-activation", rows: 1 } as const,
};
// The Tour points at "Perfil do negócio" and "Comportamento", just below, together.
const profile = {
  href: "/painel/bot/perfil",
  label: "Perfil do negócio",
  tour: { id: "nav-bot-profile", rows: 2 } as const,
};
const behaviour = { href: "/painel/bot/comportamento", label: "Comportamento" };
const links = { href: "/painel/bot/contatos-e-links", label: "Contatos e links" };

// Only the owner may test the Bot, so only the owner is offered "Testar".
// The page itself still refuses everyone else. The Tour, also the owner's
// alone, points at "Contatos e links" and "Testar" together.
const sandbox = { href: "/painel/bot/testar", label: "Testar" };
const ownerPages = [
  activation,
  profile,
  behaviour,
  { ...links, tour: { id: "nav-bot-links", rows: 2 } as const },
  sandbox,
];
const pages = [activation, profile, behaviour, links];

export function DashboardBotNavigation() {
  const { data: tenant } = useCurrentTenant();
  const { running } = useTour();
  const items = tenant?.role === "owner" ? ownerPages : pages;

  return (
    <DashboardNavigationGroup href="/painel/bot" label="Bot" items={items} forceOpen={running}>
      <BotIcon aria-hidden="true" />
    </DashboardNavigationGroup>
  );
}
