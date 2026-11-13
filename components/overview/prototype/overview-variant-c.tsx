"use client";

// PROTOTYPE (throwaway) — Variant C "Bancada": a dense workspace. One stat
// ribbon, one big chart with tabs instead of a stack of chart cards, and a
// right rail for what needs attention (Bot state, allowance, setup, team queue).
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { CheckIcon } from "lucide-react";
import { cn } from "cn";
import { ContactHoursChart } from "@/components/overview/contact-hours-chart";
import { ConversationsChart } from "@/components/overview/conversations-chart";
import { OverviewPeriod } from "@/components/overview/overview-period";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSearchParam } from "@/hooks/use-search-param";
import { formatCount } from "@/lib/format";
import { useBotActivation, useBotUsage } from "@/modules/bot/hooks";
import {
  botOnlyShare,
  contactDisplayName,
  formatTimeAgo,
  handoffReasonLabels,
  hasActiveConversations,
  hasContactMessages,
  parseStatsPeriod,
  useConversationStats,
} from "@/modules/conversations/hooks";

const tabs = [
  { key: "dia", label: "Conversas por dia" },
  { key: "hora", label: "Mensagens por horário" },
] as const;

export function OverviewVariantC({ isOwner }: { isOwner: boolean }) {
  const [value] = useSearchParam("periodo", { history: "replace" });
  const period = parseStatsPeriod(value);
  const { data: stats, dataUpdatedAt } = useConversationStats(period);
  const share = stats ? botOnlyShare(stats) : null;
  const [tab, setTab] = useState<(typeof tabs)[number]["key"]>("dia");

  return (
    <div className="-mx-4 -my-8 flex min-h-[calc(100svh-3.5rem)] flex-col sm:-mx-6 lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-5 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold">Visão geral</h1>
          <OverviewPeriod />
        </div>

        <dl className="grid grid-cols-2 overflow-hidden rounded-lg border bg-card sm:grid-cols-4 [&>div]:border-b [&>div]:border-r sm:[&>div]:border-b-0 sm:[&>div:last-child]:border-r-0">
          <Cell label="Conversas ativas" value={stats && formatCount(stats.activeConversations)} />
          <Cell
            label="Só pelo Bot"
            value={stats && (share === null ? "—" : `${share}%`)}
            hint={stats && `${formatCount(stats.botOnlyConversations)} conversas`}
            accent
          />
          <Cell
            label="Com a equipe"
            value={stats && formatCount(stats.activeConversations - stats.botOnlyConversations)}
          />
          <Cell label="Contatos novos" value={stats && formatCount(stats.newContacts)} />
        </dl>

        <section className="flex min-w-0 flex-1 flex-col rounded-lg border bg-card">
          <div role="tablist" className="flex gap-4 border-b px-4">
            {tabs.map((item) => (
              <button
                key={item.key}
                role="tab"
                type="button"
                aria-selected={tab === item.key}
                onClick={() => setTab(item.key)}
                className={cn(
                  "-mb-px border-b-2 py-3 text-sm",
                  tab === item.key
                    ? "border-brand font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex flex-1 flex-col gap-3 p-4">
            <p className="text-xs text-muted-foreground">
              {tab === "dia"
                ? "Só com o Bot ou com Handoff para a equipe."
                : "Horário de São Paulo. A faixa sombreada é o horário de atendimento."}
            </p>
            {!stats ? (
              <Skeleton className="h-80 w-full" />
            ) : tab === "dia" ? (
              hasActiveConversations(stats) ? (
                <div className="[&_[data-chart]]:h-80">
                  <ConversationsChart daily={stats.daily} />
                </div>
              ) : (
                <Quiet>Nenhuma conversa ativa no período.</Quiet>
              )
            ) : hasContactMessages(stats) ? (
              <div className="[&_[data-chart]]:h-80">
                <ContactHoursChart
                  hours={stats.contactMessagesByHour}
                  businessHours={stats.businessHours}
                />
              </div>
            ) : (
              <Quiet>Nenhuma mensagem de contato no período.</Quiet>
            )}
          </div>
        </section>
      </div>

      <aside className="flex w-full shrink-0 flex-col border-t bg-muted/30 lg:w-80 lg:border-t-0 lg:border-l">
        <BotRail isOwner={isOwner} />
        {isOwner && <AllowanceRail />}
        <RailSection title="Fila da equipe" aside={stats && `${stats.latestHandoffs.length}`}>
          {!stats ? (
            <Skeleton className="h-40 w-full" />
          ) : stats.latestHandoffs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum Handoff no período.</p>
          ) : (
            <ul className="-mx-2 flex flex-col">
              {stats.latestHandoffs.map((handoff) => (
                <li key={`${handoff.conversationId}-${handoff.at.getTime()}`}>
                  <Link
                    href={`/painel/conversas?conversa=${encodeURIComponent(handoff.conversationId)}`}
                    className="flex flex-col rounded-md px-2 py-1.5 hover:bg-muted"
                  >
                    <span className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium">
                        {contactDisplayName(handoff.contact)}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {formatTimeAgo(handoff.at, new Date(dataUpdatedAt))}
                      </span>
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {handoffReasonLabels[handoff.reason]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </RailSection>
      </aside>
    </div>
  );
}

function Cell({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 px-4 py-3">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "text-xl font-semibold tracking-tight tabular-nums",
          accent && "text-brand",
        )}
      >
        {value ?? <Skeleton className="my-0.5 h-6 w-14" />}
      </dd>
      {hint && <dd className="truncate text-xs text-muted-foreground tabular-nums">{hint}</dd>}
    </div>
  );
}

function Quiet({ children }: { children: ReactNode }) {
  return (
    <p className="flex flex-1 items-center justify-center py-24 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function RailSection({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 border-b px-5 py-5 last:border-b-0">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {aside && <span className="text-xs text-muted-foreground tabular-nums">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function BotRail({ isOwner }: { isOwner: boolean }) {
  const bot = useBotActivation();
  const status = bot.status.data;
  if (!status)
    return (
      <RailSection title="Bot">
        <Skeleton className="h-10 w-full" />
      </RailSection>
    );

  if (status.enabled)
    return (
      <RailSection title="Bot">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm">
            <span
              className={cn("size-2 rounded-full", status.paused ? "bg-amber-500" : "bg-emerald-500")}
            />
            {status.paused ? "Pausado" : "Respondendo"}
          </span>
          {isOwner && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={bot.pending}
              onClick={bot.togglePause}
            >
              {status.paused ? "Retomar" : "Pausar"}
            </Button>
          )}
        </div>
      </RailSection>
    );

  const steps = [
    { label: "WhatsApp", done: status.connected, href: "/painel/bot" },
    { label: "Perfil do negócio", done: status.profile, href: "/painel/bot/perfil" },
    { label: "Base de conhecimento", done: status.knowledge, href: "/painel/base-de-conhecimento" },
    { label: "Testar o Bot", done: status.tested, href: "/painel/bot/testar" },
  ];
  const done = steps.filter((step) => step.done).length;

  return (
    <RailSection title="Ativar o Bot" aside={`${done} de ${steps.length + 1}`}>
      {!isOwner ? (
        <p className="text-sm text-muted-foreground">O responsável ainda está configurando o Bot.</p>
      ) : (
        <>
          <ul className="flex flex-col">
            {steps.map((step) => (
              <li key={step.label}>
                <Link
                  href={step.href}
                  className="-mx-2 flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <span
                    className={cn(
                      "flex size-4 items-center justify-center rounded-full border",
                      step.done && "border-brand bg-brand text-brand-foreground",
                    )}
                  >
                    {step.done && <CheckIcon className="size-2.5" strokeWidth={3} />}
                  </span>
                  <span className={cn(step.done && "text-muted-foreground line-through")}>
                    {step.label}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            size="sm"
            disabled={done < steps.length || bot.pending}
            onClick={bot.activate}
          >
            Ativar Bot
          </Button>
        </>
      )}
    </RailSection>
  );
}

function AllowanceRail() {
  const { data } = useBotUsage();
  const percent = data ? Math.min(100, Math.round((data.used / data.limit) * 100)) : 0;
  return (
    <RailSection title="Respostas do Bot" aside={data && `${percent}%`}>
      {!data ? (
        <Skeleton className="h-8 w-full" />
      ) : (
        <div className="flex flex-col gap-2">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full",
                data.exhausted ? "bg-destructive" : data.warning ? "bg-amber-500" : "bg-brand",
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatCount(data.used)} de {formatCount(data.limit)} neste mês
          </p>
        </div>
      )}
    </RailSection>
  );
}
