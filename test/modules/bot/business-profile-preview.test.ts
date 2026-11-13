import { describe, expect, test } from "bun:test";
import type { BusinessHours, BusinessProfile } from "@/modules/bot";
import {
  businessHoursSummary,
  businessIntroduction,
  draftBusinessHours,
  toBusinessProfileDraft,
} from "@/modules/bot/hooks";

const weekdays = { opens: "09:00", closes: "18:00" };
const hours: BusinessHours = {
  monday: weekdays,
  tuesday: weekdays,
  wednesday: weekdays,
  thursday: weekdays,
  friday: weekdays,
  saturday: { opens: "09:00", closes: "13:00" },
  sunday: null,
};
const closed: BusinessHours = {
  monday: null,
  tuesday: null,
  wednesday: null,
  thursday: null,
  friday: null,
  saturday: null,
  sunday: null,
};
const profile: BusinessProfile = {
  businessName: "Barbearia do Zé",
  offer: "Cortes de cabelo e barba",
  address: "Rua das Flores, 10",
  hours,
};

describe("business hours summary", () => {
  test("groups neighbouring days that share their hours", () => {
    expect(businessHoursSummary(hours)).toBe(
      "de segunda a sexta, das 09:00 às 18:00; sábado, das 09:00 às 13:00",
    );
  });

  test("does not group days split by a closed day", () => {
    expect(businessHoursSummary({ ...hours, wednesday: null, saturday: null })).toBe(
      "segunda e terça, das 09:00 às 18:00; quinta e sexta, das 09:00 às 18:00",
    );
  });

  test("is null when the business never opens", () => {
    expect(businessHoursSummary(closed)).toBeNull();
  });
});

describe("profile draft", () => {
  test("keeps a closed day's times and submits it as closed", () => {
    const draft = toBusinessProfileDraft(profile);
    expect(draft.hours.sunday).toEqual({ open: false, opens: "09:00", closes: "18:00" });
    expect(draftBusinessHours(draft)).toEqual(hours);
  });
});

describe("business introduction", () => {
  test("introduces the business with its offer, hours and address", () => {
    expect(businessIntroduction(toBusinessProfileDraft(profile))).toBe(
      [
        "Olá! Aqui é Barbearia do Zé. Cortes de cabelo e barba.",
        "Atendemos de segunda a sexta, das 09:00 às 18:00; sábado, das 09:00 às 13:00.",
        "Estamos em Rua das Flores, 10.",
      ].join("\n\n"),
    );
  });

  test("leaves out what the profile does not have yet", () => {
    const empty = { businessName: " ", offer: "", address: "", hours: closed };
    expect(businessIntroduction(toBusinessProfileDraft(empty))).toBe("Olá!");
  });
});
