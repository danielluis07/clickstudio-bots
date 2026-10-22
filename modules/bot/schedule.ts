// When the Bot may reply. Business hours and the schedule are read in São
// Paulo time for every Tenant, as are the reply allowance's months.
export const botTimeZone = "America/Sao_Paulo";

export const weekdays = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type Weekday = (typeof weekdays)[number];

// "HH:MM" on a 24-hour clock. A day opens before it closes, so an interval
// never crosses midnight.
export type OpeningHours = { opens: string; closes: string };

// One interval per weekday, or null when the business is closed that day.
export type BusinessHours = Record<Weekday, OpeningHours | null>;

// "always": the Bot may reply at any time. "outside_business_hours": only
// while the business is closed, so the team answers during its hours.
export type BotSchedule = "always" | "outside_business_hours";

export const botSchedules = ["always", "outside_business_hours"] as const satisfies BotSchedule[];

const localTime = new Intl.DateTimeFormat("en-US", {
  timeZone: botTimeZone,
  weekday: "long",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const minutesOf = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const isOpen = (hours: BusinessHours, at: Date) => {
  const parts = Object.fromEntries(
    localTime.formatToParts(at).map(({ type, value }) => [type, value]),
  );
  const today = hours[parts.weekday.toLowerCase() as Weekday];
  if (!today) return false;
  const now = Number(parts.hour) * 60 + Number(parts.minute);
  // Open from the opening minute until, not including, the closing minute.
  return now >= minutesOf(today.opens) && now < minutesOf(today.closes);
};

// Whether the schedule lets the Bot reply at `at`. It is one of the
// independent conditions a reply needs, with Handoff and Channel pause: a
// closed schedule pauses the Bot but never hands a Conversation off.
export const scheduleAllows = (
  { schedule, hours }: { schedule: BotSchedule; hours: BusinessHours },
  at: Date,
) => schedule === "always" || !isOpen(hours, at);
