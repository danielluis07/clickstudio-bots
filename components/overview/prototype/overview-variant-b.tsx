"use client";

// PROTOTYPE (throwaway) — Variant B "Bento": hierarchy by size. One big brand
// tile says how the Bot is doing; the rest sit on borderless tinted tiles of
// different sizes, so the eye goes hero → meter → charts.
import Link from "next/link";
import type { ReactNode } from "react";
import { CheckIcon } from "lucide-react";
import { cn } from "cn";
import { ContactHoursChart } from "@/components/overview/contact-hours-chart";
import { ConversationsChart } from "@/components/overview/conversations-chart";
import { OverviewPeriod } from "@/components/overview/overview-period";
import { Skeleton } from "@/components/ui/skeleton";
import { schibsted } from "@/fonts/prototype";
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

const display = cn(schibsted.className, "tracking-tight");

export function OverviewVariantB({ isOwner }: { isOwner: boolean }) {
  const [value] = useSearchParam("periodo", { history: "replace" });
  const period = parseStatsPeriod(value);
  const { data: stats, dataUpdatedAt } = useConversationStats(period);

  return (
    <div className="flex w-full flex-col gap-5 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className={cn(display, "text-3xl font-bold")}>Visão geral</h1>
        <OverviewPeriod />
      </div>

      <div className="grid auto-rows-min gap-4 md:grid-cols-6">
        <HeroTile isOwner={isOwner} stats={stats} period={period} />

        {isOwner ? (
          <ReplyRingTile />
        ) : (
          <Tile className="md:col-span-2">
            <Metric label="Atendidas só pelo Bot" value={stats && formatCount(stats.botOnlyConversations)} />
          </Tile>
        )}

        <Tile className="md:col-span-1">
          <Metric
            label="Conversas"
            value={stats && formatCount(stats.activeConversations)}
            small
          />
        </Tile>
        <Tile className="md:col-span-1">
          <Metric label="Contatos novos" value={stats && formatCount(stats.newContacts)} small />
        </Tile>

        <Tile className="md:col-span-4" title="Conversas por dia">
          {!stats ? (
            <Skeleton className="h-64 w-full" />
          ) : hasActiveConversations(stats) ? (
            <ConversationsChart daily={stats.daily} />
          ) : (
            <TileEmpty>Nenhuma conversa ativa no período.</TileEmpty>
          )}
        </Tile>

        <Tile className="md:col-span-2" title="Últimos Handoffs">
          {!stats ? (
            <Skeleton className="h-64 w-full" />
          ) : stats.latestHandoffs.length === 0 ? (
            <TileEmpty>Nenhum Handoff no período.</TileEmpty>
          ) : (
            <ul className="-mx-2 flex flex-col gap-1">
              {stats.latestHandoffs.map((handoff) => {
                const name = contactDisplayName(handoff.contact);
                return (
                  <li key={`${handoff.conversationId}-${handoff.at.getTime()}`}>
                    <Link
                      href={`/painel/conversas?conversa=${encodeURIComponent(handoff.conversationId)}`}
                      className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-background"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-background text-xs font-semibold">
                        {name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">{name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {handoffReasonLabels[handoff.reason]}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatTimeAgo(handoff.at, new Date(dataUpdatedAt))}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Tile>

        <Tile className="md:col-span-4" title="Mensagens dos contatos por horário">
          {!stats ? (
            <Skeleton className="h-56 w-full" />
          ) : hasContactMessages(stats) ? (
            <ContactHoursChart
              hours={stats.contactMessagesByHour}
              businessHours={stats.businessHours}
            />
          ) : (
            <TileEmpty>Nenhuma mensagem de contato no período.</TileEmpty>
          )}
        </Tile>
      </div>
    </div>
  );
}

type Stats = ReturnType<typeof useConversationStats>["data"];

function Tile({
  title,
  className,
  children,
}: {
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-2xl bg-muted/60 p-5 dark:bg-muted/40",
        className,
      )}
    >
      {title && <h2 className={cn(display, "text-base font-semibold")}>{title}</h2>}
      {children}
    </section>
  );
}

function TileEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="flex flex-1 items-center justify-center py-12 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function Metric({ label, value, small }: { label: string; value: ReactNode; small?: boolean }) {
  return (
    <div className="flex h-full flex-col justify-between gap-6">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(display, "font-bold tabular-nums", small ? "text-4xl" : "text-5xl")}
      >
        {value ?? <Skeleton className="h-10 w-20" />}
      </span>
    </div>
  );
}

// The brand tile: what the Bot did for the business, or how far setup is.
function HeroTile({ isOwner, stats, period }: { isOwner: boolean; stats: Stats; period: number }) {
  const bot = useBotActivation();
  const status = bot.status.data;
  const share = stats ? botOnlyShare(stats) : null;
  const handoffs = stats ? stats.activeConversations - stats.botOnlyConversations : 0;

  return (
    <section className="relative flex min-h-64 flex-col justify-between gap-8 overflow-hidden rounded-3xl bg-brand p-6 text-brand-foreground md:col-span-2 md:row-span-2">
      {!status ? (
        <Skeleton className="h-full w-full bg-white/20" />
      ) : !status.enabled ? (
        <Setup isOwner={isOwner} status={status} pending={bot.pending} onActivate={bot.activate} />
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm font-medium">
            <span
              className={cn(
                "size-2 rounded-full",
                status.paused ? "bg-amber-300" : "animate-pulse bg-emerald-300",
              )}
            />
            {status.paused ? "Bot pausado" : "Bot atendendo agora"}
          </div>
          <div className="flex flex-col gap-2">
            <span className={cn(display, "text-7xl font-bold tabular-nums")}>
              {share === null ? "—" : `${share}%`}
            </span>
            <p className="max-w-64 text-sm opacity-85">
              das conversas dos últimos {period} dias foram resolvidas só pelo Bot.
            </p>
          </div>
          {stats && stats.activeConversations > 0 && (
            <div className="flex flex-col gap-2 text-xs tabular-nums">
              <div className="flex h-2.5 overflow-hidden rounded-full bg-white/25">
                <span
                  className="bg-white"
                  style={{
                    width: `${(stats.botOnlyConversations / stats.activeConversations) * 100}%`,
                  }}
                />
              </div>
              <div className="flex justify-between opacity-85">
                <span>{formatCount(stats.botOnlyConversations)} só Bot</span>
                <span>{formatCount(handoffs)} com a equipe</span>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Setup({
  isOwner,
  status,
  pending,
  onActivate,
}: {
  isOwner: boolean;
  status: { connected: boolean; profile: boolean; knowledge: boolean; tested: boolean };
  pending: boolean;
  onActivate: () => void;
}) {
  if (!isOwner)
    return (
      <p className={cn(display, "text-2xl font-semibold")}>
        O responsável ainda está configurando o Bot.
      </p>
    );
  const steps = [
    { label: "Conectar o WhatsApp", done: status.connected, href: "/painel/bot" },
    { label: "Preencher o perfil", done: status.profile, href: "/painel/bot/perfil" },
    {
      label: "Adicionar conhecimento",
      done: status.knowledge,
      href: "/painel/base-de-conhecimento",
    },
    { label: "Testar o Bot", done: status.tested, href: "/painel/bot/testar" },
  ];
  const done = steps.filter((step) => step.done).length;
  const ready = done === steps.length;
  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="text-sm opacity-85">{`${done} de ${steps.length + 1} etapas`}</span>
        <p className={cn(display, "text-3xl leading-tight font-bold")}>
          Falta pouco para o Bot começar a responder.
        </p>
      </div>
      <ul className="flex flex-col gap-1.5">
        {steps.map((step) => (
          <li key={step.label}>
            <Link
              href={step.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm",
                step.done ? "opacity-70" : "bg-white/15 font-medium hover:bg-white/25",
              )}
            >
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full border border-white/60",
                  step.done && "border-white bg-white text-brand",
                )}
              >
                {step.done && <CheckIcon className="size-3" strokeWidth={3} />}
              </span>
              {step.label}
            </Link>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={!ready || pending}
        onClick={onActivate}
        className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-brand disabled:opacity-60"
      >
        Ativar o Bot
      </button>
    </>
  );
}

function ReplyRingTile() {
  const { data } = useBotUsage();
  const percent = data ? Math.min(100, (data.used / data.limit) * 100) : 0;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  return (
    <Tile className="md:col-span-2 md:row-span-1">
      <div className="flex items-center gap-5">
        <svg viewBox="0 0 100 100" className="size-28 shrink-0 -rotate-90" aria-hidden="true">
          <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="10" className="stroke-background" />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - percent / 100)}
            className={cn(
              data?.exhausted
                ? "stroke-destructive"
                : data?.warning
                  ? "stroke-amber-500"
                  : "stroke-brand",
            )}
          />
        </svg>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-sm text-muted-foreground">Respostas do Bot neste mês</span>
          <span className={cn(display, "text-3xl font-bold tabular-nums")}>
            {data ? formatCount(data.used) : <Skeleton className="h-8 w-16" />}
          </span>
          {data && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {data.exhausted
                ? "Limite do mês atingido"
                : `de ${formatCount(data.limit)} incluídas no plano`}
            </span>
          )}
        </div>
      </div>
    </Tile>
  );
}
