// Every Tenant's calendar is São Paulo's: business hours, allowance months,
// daily caps and the dates shown to Members. This is the one place that names
// the zone and does calendar arithmetic in it.
export const businessTimeZone = "America/Sao_Paulo";

export const minuteMs = 60 * 1000;
export const hourMs = 60 * minuteMs;
export const dayMs = 24 * hourMs;

// The instant `days` days before `now`, in absolute time rather than calendar
// days.
export const daysBefore = (now: Date, days: number) => new Date(now.getTime() - days * dayMs);

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: businessTimeZone,
  weekday: "long",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

// The wall-clock reading in São Paulo at `at`; `weekday` is lowercase English.
export const localParts = (at: Date) => {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(at).map(({ type, value }) => [type, value]),
  );
  return {
    weekday: parts.weekday.toLowerCase(),
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
};

const two = (value: number) => String(value).padStart(2, "0");

// "HH:MM" on a 24-hour clock, zero-padded so times compare as strings.
export const localClock = (at: Date) => {
  const { hour, minute } = localParts(at);
  return `${two(hour)}:${two(minute)}`;
};

// "YYYY-MM" of the São Paulo month containing `at`.
export const localMonth = (at: Date) => {
  const { year, month } = localParts(at);
  return `${year}-${two(month)}`;
};

// "YYYY-MM-DD" of the São Paulo day containing `at`.
export const localDay = (at: Date) => {
  const { year, month, day } = localParts(at);
  return `${year}-${two(month)}-${two(day)}`;
};

// The instant the São Paulo day containing `at` began. It assumes the offset
// did not change since midnight, true while Brazil keeps no daylight saving
// (none since 2019: always UTC-3). Revisit every helper here if that changes.
export const startOfLocalDay = (at: Date) => {
  const { year, month, day, hour, minute, second } = localParts(at);
  const local = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset = local - Math.floor(at.getTime() / 1000) * 1000;
  return new Date(Date.UTC(year, month - 1, day) - offset);
};

// The instant the São Paulo day after `day` ("YYYY-MM-DD") begins: the end of
// that whole day. Noon UTC of the next day is always inside it.
export const endOfLocalDate = (day: string) => {
  const [year, month, date] = day.split("-").map(Number);
  return startOfLocalDay(new Date(Date.UTC(year, month - 1, date + 1, 12)));
};
