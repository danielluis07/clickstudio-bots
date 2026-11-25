import type { Clock } from "@/platform/clock";
import { dayMs } from "@/platform/time";

export const invitationLifetimeDays = 7;

export const invitationExpiry = (clock: Clock) =>
  new Date(clock.now().getTime() + invitationLifetimeDays * dayMs);

export const invitationUrl = (appUrl: string, invitationId: string) =>
  `${appUrl}/convite/${invitationId}`;
