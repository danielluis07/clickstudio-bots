"use client";

import { useState } from "react";
import type { BusinessProfile } from "@/modules/bot/repository";
import type { OpeningHours, Weekday } from "@/modules/bot/schedule";
import { toBusinessProfileDraft } from "@/modules/bot/hooks/business-profile-preview";

type DayChange = Partial<OpeningHours & { open: boolean }>;

// The Business profile form's values, so the preview can follow them as the
// owner types. Starts from the saved profile; remount to reset it.
export const useBusinessProfileDraft = (profile: BusinessProfile) => {
  const [draft, setDraft] = useState(() => toBusinessProfileDraft(profile));
  return {
    draft,
    setField: (field: "businessName" | "offer" | "address", value: string) =>
      setDraft((current) => ({ ...current, [field]: value })),
    setDay: (day: Weekday, change: DayChange) =>
      setDraft((current) => ({
        ...current,
        hours: { ...current.hours, [day]: { ...current.hours[day], ...change } },
      })),
  };
};

export type BusinessProfileDraftState = ReturnType<typeof useBusinessProfileDraft>;
