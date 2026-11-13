"use client";

// PROTOTYPE (throwaway) — Variant B "Bento" for a settings page: a section
// index on the left, each section on its own tinted panel, and the week shown
// as seven day tiles you click to edit.
import { useState, type FormEvent, type ReactNode } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/bot/prototype/prototype-switch";
import { Textarea } from "@/components/ui/textarea";
import { schibsted } from "@/fonts/prototype";
import { formatCount, formatDateTime } from "@/lib/format";
import type { Weekday } from "@/modules/bot";
import { weekdayOptions } from "@/modules/bot/hooks";
import type { ProfilePrototypeProps } from "@/components/bot/prototype/profile-prototype";

const display = cn(schibsted.className, "tracking-tight");
const sections = [
  { id: "b-sobre", label: "Sobre o negócio" },
  { id: "b-horario", label: "Horário de funcionamento" },
];

export function ProfileVariantB({ profile, savedAt, savedBy, limits, canEdit }: ProfilePrototypeProps) {
  const [hours, setHours] = useState(profile.hours);
  const [selected, setSelected] = useState<Weekday>("monday");
  const [note, setNote] = useState<string | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setNote("Protótipo: nada foi salvo.");
  };
  const day = weekdayOptions.find((option) => option.day === selected)!;
  const dayHours = hours[selected];

  return (
    <div className="flex w-full flex-col gap-8 pb-24">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-2xl flex-col gap-2">
          <h1 className={cn(display, "text-3xl font-bold")}>Perfil do negócio</h1>
          <p className="text-muted-foreground">
            O que o Bot sabe sobre o negócio. Vale a partir da próxima resposta.
          </p>
        </div>
        {savedAt && (
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
            Salvo em {formatDateTime(savedAt)} por {savedBy ?? "Membro removido"}
          </span>
        )}
      </header>

      <div className="grid gap-8 lg:grid-cols-[13rem_1fr]">
        <nav aria-label="Seções" className="lg:sticky lg:top-6 lg:self-start">
          <ul className="flex gap-1 lg:flex-col">
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="block rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <form onSubmit={submit} className="flex max-w-3xl flex-col gap-4">
          <fieldset disabled={!canEdit} className="contents">
            <Panel id="b-sobre" title="Sobre o negócio">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Nome do negócio" id="b-name">
                  <Input id="b-name" defaultValue={profile.businessName} maxLength={limits.businessName} className="bg-background" />
                </Field>
                <Field label="Endereço" id="b-address">
                  <Input id="b-address" defaultValue={profile.address} maxLength={limits.address} className="bg-background" />
                </Field>
              </div>
              <Field
                label="O que o negócio oferece"
                id="b-offer"
                hint={`Um resumo, como “Cortes de cabelo e barba”. Até ${formatCount(limits.offer)} caracteres.`}
              >
                <Textarea id="b-offer" defaultValue={profile.offer} maxLength={limits.offer} rows={3} className="bg-background" />
              </Field>
            </Panel>

            <Panel
              id="b-horario"
              title="Horário de funcionamento"
              description="Horário de Brasília. Toque num dia para mudar o horário."
            >
              <div className="grid grid-cols-7 gap-2">
                {weekdayOptions.map(({ day: weekday, label }) => {
                  const value = hours[weekday];
                  return (
                    <button
                      key={weekday}
                      type="button"
                      aria-pressed={selected === weekday}
                      onClick={() => setSelected(weekday)}
                      className={cn(
                        "flex flex-col items-start gap-3 rounded-xl p-2.5 text-left ring-2 ring-transparent transition-colors sm:p-3",
                        value ? "bg-brand/12 dark:bg-brand/20" : "bg-background",
                        selected === weekday && "ring-brand",
                      )}
                    >
                      <span className="text-sm font-semibold">{label.slice(0, 3)}</span>
                      <span
                        className={cn(
                          "text-[11px] leading-tight tabular-nums sm:text-xs",
                          value ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {value ? (
                          <>
                            {value.opens}
                            <br />
                            {value.closes}
                          </>
                        ) : (
                          "Fechado"
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl bg-background p-4">
                <label className="flex items-center gap-3 text-sm font-medium">
                  <Switch
                    checked={dayHours !== null}
                    onChange={(open) =>
                      setHours((current) => ({
                        ...current,
                        [selected]: open
                          ? (profile.hours[selected] ?? { opens: "09:00", closes: "18:00" })
                          : null,
                      }))
                    }
                  />
                  {day.label}: {dayHours ? "aberto" : "fechado"}
                </label>
                {dayHours && (
                  <div key={selected} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Input
                      type="time"
                      defaultValue={dayHours.opens}
                      className="w-28"
                      aria-label={`${day.label}: abre às`}
                      onChange={(event) =>
                        setHours((current) => ({
                          ...current,
                          [selected]: { ...dayHours, opens: event.target.value },
                        }))
                      }
                    />
                    às
                    <Input
                      type="time"
                      defaultValue={dayHours.closes}
                      className="w-28"
                      aria-label={`${day.label}: fecha às`}
                      onChange={(event) =>
                        setHours((current) => ({
                          ...current,
                          [selected]: { ...dayHours, closes: event.target.value },
                        }))
                      }
                    />
                  </div>
                )}
              </div>
            </Panel>
          </fieldset>

          {canEdit && (
            <div className="flex items-center justify-end gap-4 pt-2">
              {note && (
                <span role="status" className="text-sm text-muted-foreground">
                  {note}
                </span>
              )}
              <Button type="submit" size="lg" className="rounded-xl">
                Salvar perfil
              </Button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

function Panel({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="flex scroll-mt-6 flex-col gap-5 rounded-2xl bg-muted/60 p-6 dark:bg-muted/40"
    >
      <div className="flex flex-col gap-1">
        <h2 className={cn(display, "text-lg font-semibold")}>{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  id,
  hint,
  children,
}: {
  label: string;
  id: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
