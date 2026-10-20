import type { Clock } from "@/platform/clock";

export const invitationLifetimeDays = 7;
const dayInMilliseconds = 24 * 60 * 60 * 1000;

export const invitationExpiry = (clock: Clock) =>
  new Date(clock.now().getTime() + invitationLifetimeDays * dayInMilliseconds);

export const invitationUrl = (appUrl: string, invitationId: string) =>
  `${appUrl}/convite/${invitationId}`;
