"use client";

// PROTOTYPE (throwaway) — Variant A "Relatório": no cards. The page reads like
// a short report: one sentence headline built from the numbers, a KPI strip
// split by hairlines, and charts sitting straight on the canvas.
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "cn";
import { ContactHoursChart } from "@/components/overview/contact-hours-chart";
import { ConversationsChart } from "@/components/overview/conversations-chart";
import { LatestHandoffs } from "@/components/overview/latest-handoffs";
import { OverviewPeriod } from "@/components/overview/overview-period";
import { Skeleton } from "@/components/ui/skeleton";
import { bricolage } from "@/fonts/prototype";
import { useSearchParam } from "@/hooks/use-search-param";
import { formatCount } from "@/lib/format";
import { useBotActivation, useBotUsage } from "@/modules/bot/hooks";
import {
  botOnlyShare,
  hasActiveConversations,
  hasContactMessages,
  parseStatsPeriod,
  useConversationStats,
} from "@/modules/conversations/hooks";

export function OverviewVariantA({ isOwner }: { isOwner: boolean }) {
  const [value] = useSearchParam("periodo", { history: "replace" });
  const period = parseStatsPeriod(value);
  const { data: stats, dataUpdatedAt } = useConversationStats(period);
  const share = stats ? botOnlyShare(stats) : null;

  return (
    <div className="flex w-full max-w-6xl flex-col gap-14 pb-24">
      <header className="flex flex-col gap-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-sm font-medium text-muted-foreground">Visão geral</h1>
          <OverviewPeriod />
        </div>
        {stats ? (
          <p
            className={cn(
              bricolage.className,
              "max-w-4xl text-3xl leading-[1.15] font-medium tracking-tight text-muted-foreground sm:text-[2.75rem]",
            )}
          >
            Nos últimos {period} dias,{" "}
            <Num>{formatCount(stats.activeConversations)} conversas</Num> chegaram pelo WhatsApp.{" "}
            {share === null ? (
              "Ainda não há conversas para medir o Bot."
            ) : (
              <>
                O Bot resolveu <Num>{share}%</Num> delas sem chamar a equipe.
              </>
            )}
          </p>
        ) : (
          <Skeleton className="h-28 max-w-3xl" />
        )}
      </header>

      <SetupTrack isOwner={isOwner} />

      <dl className="grid grid-cols-2 gap-y-8 lg:grid-cols-4">
        <Kpi label="Conversas ativas" value={stats && formatCount(stats.activeConversations)} />
        <Kpi
          label="Atendidas só pelo Bot"
          value={stats && formatCount(stats.botOnlyConversations)}
        />
        <Kpi label="Contatos novos" value={stats && formatCount(stats.newContacts)} />
        {isOwner && <ReplyKpi />}
      </dl>

      <Section
        title="Conversas por dia"
        description="Em azul, as que o Bot resolveu sozinho; em cinza, as que foram para a equipe."
      >
        {!stats ? (
          <Skeleton className="h-72 w-full" />
        ) : hasActiveConversations(stats) ? (
          <ConversationsChart daily={stats.daily} />
        ) : (
          <Empty>Nenhuma conversa ativa no período.</Empty>
        )}
      </Section>

      <div className="grid gap-14 lg:grid-cols-[3fr_2fr] lg:gap-12">
        <Section
          title="Quando os contatos escrevem"
          description="Por hora, no horário de São Paulo. O fundo sombreado é o horário de atendimento."
        >
          {!stats ? (
            <Skeleton className="h-56 w-full" />
          ) : hasContactMessages(stats) ? (
            <ContactHoursChart
              hours={stats.contactMessagesByHour}
              businessHours={stats.businessHours}
            />
          ) : (
            <Empty>Nenhuma mensagem de contato no período.</Empty>
          )}
        </Section>
        <Section title="Passadas para a equipe" description="Os Handoffs mais recentes.">
          {stats ? (
            <LatestHandoffs handoffs={stats.latestHandoffs} now={new Date(dataUpdatedAt)} />
          ) : (
            <Skeleton className="h-56 w-full" />
          )}
        </Section>
      </div>
    </div>
  );
}

function Num({ children }: { children: ReactNode }) {
  return <span className="text-foreground tabular-nums">{children}</span>;
}

function Kpi({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-l-2 pl-5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={cn(bricolage.className, "text-4xl font-medium tracking-tight tabular-nums")}>
        {value ?? <Skeleton className="my-1 h-9 w-20" />}
      </dd>
      {note}
    </div>
  );
}

function ReplyKpi() {
  const { data } = useBotUsage();
  const percent = data ? Math.min(100, Math.round((data.used / data.limit) * 100)) : 0;
  return (
    <Kpi
      label="Respostas do Bot no mês"
      value={data && formatCount(data.used)}
      note={
        data && (
          <dd className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
            <span className="h-1 w-16 overflow-hidden rounded-full bg-muted">
              <span
                className={cn(
                  "block h-full",
                  data.exhausted ? "bg-destructive" : data.warning ? "bg-amber-500" : "bg-brand",
                )}
                style={{ width: `${percent}%` }}
              />
            </span>
            de {formatCount(data.limit)}
          </dd>
        )
      }
    />
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-6 border-t pt-6">
      <div className="flex flex-col gap-1">
        <h2 className={cn(bricolage.className, "text-xl font-medium tracking-tight")}>{title}</h2>
        <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-16 text-sm text-muted-foreground">{children}</p>;
}

// The five setup checks as one horizontal track, with the next one to do.
function SetupTrack({ isOwner }: { isOwner: boolean }) {
  const bot = useBotActivation();
  const status = bot.status.data;
  if (!status || status.enabled) return null;
  if (!isOwner)
    return (
      <p className="text-sm text-muted-foreground">O responsável ainda está configurando o Bot.</p>
    );

  const ready = status.connected && status.profile && status.knowledge && status.tested;
  const steps = [
    { label: "WhatsApp", done: status.connected, href: "/painel/bot" },
    { label: "Perfil do negócio", done: status.profile, href: "/painel/bot/perfil" },
    { label: "Base de conhecimento", done: status.knowledge, href: "/painel/base-de-conhecimento" },
    { label: "Testar o Bot", done: status.tested, href: "/painel/bot/testar" },
    { label: "Ativar o Bot", done: false, href: "/painel/bot" },
  ];
  const next = steps.find((step) => !step.done)!;

  return (
    <section aria-labelledby="setup-a" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="setup-a" className={cn(bricolage.className, "text-xl font-medium tracking-tight")}>
          O Bot ainda não está respondendo
        </h2>
        {ready ? (
          <button
            type="button"
            onClick={bot.activate}
            disabled={bot.pending}
            className="text-sm font-medium text-brand underline-offset-4 hover:underline"
          >
            Ativar o Bot agora
          </button>
        ) : (
          <Link
            href={next.href}
            className="text-sm font-medium text-brand underline-offset-4 hover:underline"
          >
            Próximo passo: {next.label}
          </Link>
        )}
      </div>
      <ol className="grid grid-cols-5 gap-2">
        {steps.map((step) => (
          <li key={step.label} className="flex flex-col gap-2">
            <span className={cn("h-1.5 rounded-full", step.done ? "bg-brand" : "bg-muted")} />
            <span
              className={cn(
                "text-xs",
                step.done ? "text-muted-foreground" : "font-medium text-foreground",
              )}
            >
              {step.label}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
