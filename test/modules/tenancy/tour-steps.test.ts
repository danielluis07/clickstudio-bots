import { describe, expect, test } from "bun:test";
import { tourSteps, type TourStepId } from "@/modules/tenancy/hooks";

const ids = (steps: ReturnType<typeof tourSteps>) => steps.map((step) => step.id);

describe("Tour steps", () => {
  test("an owner walks through every area and ends at Primeiros passos while the Bot is not live", () => {
    expect(ids(tourSteps({ role: "owner", botLive: false }))).toEqual([
      "welcome",
      "overview",
      "conversations",
      "knowledge-base",
      "bot-profile",
      "bot-links",
      "bot-activation",
      "settings",
      "header",
      "first-steps",
    ]);
  });

  test("an owner whose Bot is live ends at Ver tour instead", () => {
    const steps = tourSteps({ role: "owner", botLive: true });
    expect(ids(steps).at(-1)).toBe("replay");
    expect(ids(steps)).not.toContain("first-steps");
    expect(steps).toHaveLength(10);
  });

  test("an attendant sees only what they can use, whether or not the Bot is live", () => {
    const attendant: TourStepId[] = [
      "welcome",
      "overview",
      "conversations",
      "alert-bell",
      "alert-preferences",
      "replay",
    ];
    expect(ids(tourSteps({ role: "member", botLive: false }))).toEqual(attendant);
    expect(ids(tourSteps({ role: "member", botLive: true }))).toEqual(attendant);
    // Only the owner has the owner's areas; an admin Member is no owner.
    expect(ids(tourSteps({ role: "admin", botLive: false }))).toEqual(attendant);
  });

  test("the welcome is attached to nothing, and every other step highlights its own area", () => {
    const steps = tourSteps({ role: "owner", botLive: false });
    expect(steps[0].target).toBeNull();
    const targets = steps.slice(1).map((step) => step.target);
    expect(targets.every(Boolean)).toBe(true);
    expect(new Set(targets).size).toBe(targets.length);
  });
});
