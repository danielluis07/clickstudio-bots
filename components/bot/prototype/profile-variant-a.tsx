"use client";

// PROTOTYPE (throwaway) — Variant A "Relatório" for a settings page: no cards.
// Each section is a row: what it is on the left, its fields on the right,
// split by a hairline. Saving lives in a bar pinned to the bottom.
import { useState, type FormEvent, type ReactNode } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { bricolage } from "@/fonts/prototype";
import { formatCount, formatDateTime } from "@/lib/format";
import { weekdayOptions } from "@/modules/bot/hooks";
import type { ProfilePrototypeProps } from "@/components/bot/prototype/profile-prototype";

export function ProfileVariantA({ profile, savedAt, savedBy, limits, canEdit }: ProfilePrototypeProps) {
  const [hours, setHours] = useState(profile.hours);
  const [dirty, setDirty] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setDirty(false);
    setNote("Protótipo: nada foi salvo.");
  };

  return (
    <form
      onSubmit={submit}
      onChange={() => setDirty(true)}
      className="flex w-full max-w-5xl flex-col pb-8"
    >
      <header className="flex flex-col gap-3 pb-10">
        <h1 className={cn(bricolage.className, "text-4xl font-medium tracking-tight")}>
          Perfil do negócio
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          O que o Bot sabe sobre o negócio. As alterações valem a partir da próxima resposta,
          inclusive nas conversas em andamento.
        </p>
        {savedAt && (
          <p className="text-xs text-muted-foreground">
            Salvo em {formatDateTime(savedAt)} por {savedBy ?? "Membro removido"}
          </p>
        )}
      </header>

      <fieldset disabled={!canEdit} className="contents">
        <Row
          title="Sobre o negócio"
          description="Como o Bot apresenta o negócio aos contatos."
        >
          <Field label="Nome do negócio" id="a-name">
            <Input id="a-name" defaultValue={profile.businessName} maxLength={limits.businessName} />
          </Field>
          <Field
            label="O que o negócio oferece"
            id="a-offer"
            hint={`Um resumo, como “Cortes de cabelo e barba”. Até ${formatCount(limits.offer)} caracteres; preços e detalhes vão na base de conhecimento.`}
          >
            <Textarea id="a-offer" defaultValue={profile.offer} maxLength={limits.offer} rows={3} />
          </Field>
          <Field label="Endereço" id="a-address">
            <Input id="a-address" defaultValue={profile.address} maxLength={limits.address} />
          </Field>
        </Row>

        <Row
          title="Horário de funcionamento"
          description="Horário de Brasília. O Bot informa esse horário aos contatos."
        >
          <div className="flex flex-col divide-y rounded-none">
            {weekdayOptions.map(({ day, label }) => {
              const open = hours[day] !== null;
              return (
                <div key={day} className="flex min-h-12 flex-wrap items-center gap-x-6 gap-y-2 py-2">
                  <label className="flex w-40 items-center gap-3 text-sm">
                    <Checkbox
                      checked={open}
                      onCheckedChange={(checked) => {
                        setDirty(true);
                        setHours((current) => ({
                          ...current,
                          [day]: checked ? (profile.hours[day] ?? { opens: "09:00", closes: "18:00" }) : null,
                        }));
                      }}
                    />
                    {label}
                  </label>
                  {open ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Input type="time" defaultValue={hours[day]!.opens} className="w-28" aria-label={`${label}: abre às`} />
                      às
                      <Input type="time" defaultValue={hours[day]!.closes} className="w-28" aria-label={`${label}: fecha às`} />
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">Fechado</span>
                  )}
                </div>
              );
            })}
          </div>
        </Row>
      </fieldset>

      {canEdit && (
        <div className="sticky bottom-0 -mx-4 mt-6 flex items-center justify-end gap-4 border-t bg-background/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <span className="text-sm text-muted-foreground" role="status">
            {note ?? (dirty ? "Alterações não salvas" : "")}
          </span>
          <Button type="submit" disabled={!dirty}>
            Salvar perfil
          </Button>
        </div>
      )}
    </form>
  );
}

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-6 border-t py-10 md:grid-cols-[15rem_1fr] md:gap-12">
      <div className="flex flex-col gap-1.5">
        <h2 className={cn(bricolage.className, "text-lg font-medium tracking-tight")}>{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex max-w-xl flex-col gap-6">{children}</div>
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
