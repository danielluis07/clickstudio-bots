"use client";

// PROTOTYPE (throwaway) — Variant C "Bancada" for a settings page: a compact
// form on the left and, on the right, a live preview of how the Bot would
// introduce the business on WhatsApp. The preview updates as you type.
import { useState, type FormEvent, type ReactNode } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatCount, formatDateTime } from "@/lib/format";
import type { BusinessHours } from "@/modules/bot";
import { weekdayOptions } from "@/modules/bot/hooks";
import type { ProfilePrototypeProps } from "@/components/bot/prototype/profile-prototype";

export function ProfileVariantC({ profile, savedAt, savedBy, limits, canEdit }: ProfilePrototypeProps) {
  const [values, setValues] = useState(profile);
  const [note, setNote] = useState<string | null>(null);
  const set = (patch: Partial<typeof profile>) => setValues((current) => ({ ...current, ...patch }));
  const setDay = (day: keyof BusinessHours, value: BusinessHours[keyof BusinessHours]) =>
    set({ hours: { ...values.hours, [day]: value } });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setNote("Protótipo: nada foi salvo.");
  };

  return (
    <div className="-mx-4 -my-8 flex min-h-[calc(100svh-3.5rem)] flex-col sm:-mx-6 lg:flex-row">
      <form onSubmit={submit} className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-col gap-1 border-b px-4 py-5 sm:px-6">
          <h1 className="text-lg font-semibold">Perfil do negócio</h1>
          <p className="text-sm text-muted-foreground">
            O que o Bot sabe sobre o negócio. Vale a partir da próxima resposta.
            {savedAt && ` Salvo em ${formatDateTime(savedAt)} por ${savedBy ?? "Membro removido"}.`}
          </p>
        </div>

        <fieldset disabled={!canEdit} className="flex flex-1 flex-col">
          <Group title="Sobre o negócio">
            <Row label="Nome" htmlFor="c-name">
              <Input
                id="c-name"
                value={values.businessName}
                maxLength={limits.businessName}
                onChange={(event) => set({ businessName: event.target.value })}
              />
            </Row>
            <Row
              label="Oferta"
              htmlFor="c-offer"
              hint={`${values.offer.length}/${formatCount(limits.offer)}. Preços e detalhes vão na base de conhecimento.`}
            >
              <Textarea
                id="c-offer"
                rows={3}
                value={values.offer}
                maxLength={limits.offer}
                onChange={(event) => set({ offer: event.target.value })}
              />
            </Row>
            <Row label="Endereço" htmlFor="c-address">
              <Input
                id="c-address"
                value={values.address}
                maxLength={limits.address}
                onChange={(event) => set({ address: event.target.value })}
              />
            </Row>
          </Group>

          <Group title="Horário de funcionamento" note="Horário de Brasília">
            <table className="w-full max-w-xl text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="pb-2 font-normal">Dia</th>
                  <th className="pb-2 font-normal">Abre</th>
                  <th className="pb-2 font-normal">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {weekdayOptions.map(({ day, label }) => {
                  const value = values.hours[day];
                  return (
                    <tr key={day} className="border-t">
                      <td className="py-1.5 pr-3">
                        <label className="flex items-center gap-2.5">
                          <Checkbox
                            checked={value !== null}
                            onCheckedChange={(checked) =>
                              setDay(
                                day,
                                checked
                                  ? (profile.hours[day] ?? { opens: "09:00", closes: "18:00" })
                                  : null,
                              )
                            }
                          />
                          {label}
                        </label>
                      </td>
                      {value ? (
                        <>
                          <td className="py-1.5 pr-2">
                            <Input
                              type="time"
                              className="h-8 w-28"
                              value={value.opens}
                              aria-label={`${label}: abre às`}
                              onChange={(event) => setDay(day, { ...value, opens: event.target.value })}
                            />
                          </td>
                          <td className="py-1.5">
                            <Input
                              type="time"
                              className="h-8 w-28"
                              value={value.closes}
                              aria-label={`${label}: fecha às`}
                              onChange={(event) => setDay(day, { ...value, closes: event.target.value })}
                            />
                          </td>
                        </>
                      ) : (
                        <td colSpan={2} className="py-1.5 text-muted-foreground">
                          Fechado
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Group>
        </fieldset>

        {canEdit && (
          <div className="sticky bottom-0 flex items-center justify-between gap-4 border-t bg-background px-4 py-3 sm:px-6">
            <span role="status" className="text-sm text-muted-foreground">
              {note}
            </span>
            <Button type="submit">Salvar perfil</Button>
          </div>
        )}
      </form>

      <aside className="w-full shrink-0 border-t bg-muted/30 lg:w-96 lg:border-t-0 lg:border-l">
        <div className="flex flex-col gap-3 p-5 lg:sticky lg:top-0">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-sm font-semibold">Prévia no WhatsApp</h2>
            <p className="text-xs text-muted-foreground">
              Ilustração: o Bot usa estas informações quando um contato pergunta.
            </p>
          </div>
          <div className="flex flex-col gap-2 rounded-xl bg-[#efeae2] p-3 dark:bg-[#0b141a]">
            <Bubble side="contact">Oi! Vocês abrem amanhã? Onde fica?</Bubble>
            <Bubble side="bot">
              Olá! Aqui é {values.businessName.trim() || "o seu negócio"}.
              {values.offer.trim() && ` ${values.offer.trim().replace(/\.?$/, ".")}`}
              {"\n\n"}
              {hoursSummary(values.hours)}
              {values.address.trim() && `\n\nEstamos em ${values.address.trim()}.`}
            </Bubble>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Group({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-b px-4 py-6 sm:px-6">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </div>
      {children}
    </section>
  );
}

function Row({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid max-w-2xl gap-1.5 sm:grid-cols-[7rem_1fr] sm:gap-4">
      <label htmlFor={htmlFor} className="pt-2 text-sm text-muted-foreground">
        {label}
      </label>
      <div className="flex flex-col gap-1">
        {children}
        {hint && <p className="text-xs text-muted-foreground tabular-nums">{hint}</p>}
      </div>
    </div>
  );
}

function Bubble({ side, children }: { side: "contact" | "bot"; children: ReactNode }) {
  return (
    <p
      className={cn(
        "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-line text-zinc-900 shadow-sm dark:text-zinc-100",
        side === "contact"
          ? "self-start bg-white dark:bg-[#202c33]"
          : "self-end bg-[#d9fdd3] dark:bg-[#005c4b]",
      )}
    >
      {children}
    </p>
  );
}

// "Segunda a sexta, das 09:00 às 18:00. Sábado, das 09:00 às 13:00."
function hoursSummary(hours: BusinessHours) {
  const groups: { from: string; to: string; key: string }[] = [];
  for (const { day, label } of weekdayOptions) {
    const value = hours[day];
    const key = value ? `${value.opens}-${value.closes}` : "closed";
    const last = groups.at(-1);
    if (last && last.key === key) last.to = label;
    else groups.push({ from: label, to: label, key });
  }
  const open = groups.filter((group) => group.key !== "closed");
  if (open.length === 0) return "No momento não temos horário de atendimento definido.";
  const short = (label: string) => label.replace("-feira", "").toLowerCase();
  return `Atendemos: ${open
    .map((group) => {
      const [opens, closes] = group.key.split("-");
      const days =
        group.from === group.to ? short(group.from) : `${short(group.from)} a ${short(group.to)}`;
      return `${days}, das ${opens} às ${closes}`;
    })
    .join("; ")}.`;
}
