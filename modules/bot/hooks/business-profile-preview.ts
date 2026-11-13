import type { BusinessProfile } from "@/modules/bot/repository";
import type { BusinessHours, OpeningHours, Weekday } from "@/modules/bot/schedule";
import { weekdayOptions } from "@/modules/bot/hooks/settings-labels";

// The profile as the owner edits it. A closed day keeps its times, so ticking
// it again brings them back.
export type BusinessProfileDraft = Omit<BusinessProfile, "hours"> & {
  hours: Record<Weekday, OpeningHours & { open: boolean }>;
};

const defaultOpeningHours: OpeningHours = { opens: "09:00", closes: "18:00" };

export const toBusinessProfileDraft = (profile: BusinessProfile): BusinessProfileDraft => ({
  ...profile,
  hours: Object.fromEntries(
    weekdayOptions.map(({ day }) => {
      const hours = profile.hours[day];
      return [day, { open: hours !== null, ...(hours ?? defaultOpeningHours) }];
    }),
  ) as BusinessProfileDraft["hours"],
});

export const draftBusinessHours = (draft: BusinessProfileDraft): BusinessHours =>
  Object.fromEntries(
    weekdayOptions.map(({ day }) => {
      const { open, opens, closes } = draft.hours[day];
      return [day, open ? { opens, closes } : null];
    }),
  ) as BusinessHours;

const dayName = (label: string) => label.replace("-feira", "").toLowerCase();

// "de segunda a sexta, das 09:00 às 18:00; sábado, das 09:00 às 13:00",
// grouping neighbouring days with the same hours. Null when always closed.
export const businessHoursSummary = (hours: BusinessHours): string | null => {
  const runs: { first: string; last: string; days: number; hours: OpeningHours | null }[] = [];
  for (const { day, label } of weekdayOptions) {
    const today = hours[day];
    const run = runs.at(-1);
    const same = run && run.hours?.opens === today?.opens && run.hours?.closes === today?.closes;
    if (run && same) {
      run.last = label;
      run.days += 1;
    } else runs.push({ first: label, last: label, days: 1, hours: today });
  }
  const open = runs.filter((run) => run.hours !== null);
  if (open.length === 0) return null;
  return open
    .map(({ first, last, days: count, hours: run }) => {
      const days =
        count === 1
          ? dayName(first)
          : count === 2
            ? `${dayName(first)} e ${dayName(last)}`
            : `de ${dayName(first)} a ${dayName(last)}`;
      return `${days}, das ${run!.opens} às ${run!.closes}`;
    })
    .join("; ");
};

// How the Bot might introduce the business with this profile: an
// illustration for the preview, not the Bot's actual reply.
export const businessIntroduction = (draft: BusinessProfileDraft): string => {
  const name = draft.businessName.trim();
  const offer = draft.offer.trim();
  const address = draft.address.trim();
  const hours = businessHoursSummary(draftBusinessHours(draft));
  return [
    [name ? `Olá! Aqui é ${name}.` : "Olá!", offer && offer.replace(/[.!]?$/, ".")]
      .filter(Boolean)
      .join(" "),
    hours && `Atendemos ${hours}.`,
    address && `Estamos em ${address}.`,
  ]
    .filter(Boolean)
    .join("\n\n");
};
