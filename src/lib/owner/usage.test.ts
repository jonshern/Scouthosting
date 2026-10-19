// How the owner console labels a unit's activity, and which units it
// calls out as paying-but-dormant or trial-and-active.

import { describe, expect, it } from "vitest";
import { summarizeUsage, usageState, type UnitUsage } from "./usage";
import type { UnitRow } from "./console";

const NOW = new Date("2026-10-19T12:00:00Z");
const days = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("usageState", () => {
  it("active this week, quiet in the window, dormant after it", () => {
    expect(usageState(days(2), days(100), 30, NOW)).toBe("active");
    expect(usageState(days(20), days(100), 30, NOW)).toBe("quiet");
    expect(usageState(days(40), days(100), 30, NOW)).toBe("dormant");
    expect(usageState(null, days(100), 30, NOW)).toBe("dormant");
  });

  it("a new unit with nothing yet hasn't started rather than gone dormant", () => {
    expect(usageState(null, days(5), 30, NOW)).toBe("not_started");
    expect(usageState(null, days(20), 30, NOW)).toBe("dormant");
  });
});

describe("summarizeUsage", () => {
  const row = (id: string, kind: string, state: UnitUsage["state"], isDemo = false): UnitUsage =>
    ({
      unit: { id, isDemo, license: { kind } } as unknown as UnitRow,
      counts: { events: 2, messages: 3, posts: 1, photos: 0, rsvps: 4, signoffs: 5, peopleSignedIn: 1 },
      upcomingEvents: 0,
      lastActiveAt: null,
      state,
    });

  it("adds up real units only and picks out the ones to look at", () => {
    const s = summarizeUsage(
      [row("a", "paid", "dormant"), row("b", "trial", "active"), row("c", "trial", "quiet"), row("d", "paid", "active", true)],
      30,
    );
    expect(s.units).toEqual({ active: 1, quiet: 1, dormant: 1, not_started: 0 });
    expect(s.totals.messages).toBe(9);
    expect(s.payingDormant.map((r) => r.unit.id)).toEqual(["a"]);
    expect(s.trialActive.map((r) => r.unit.id)).toEqual(["b"]);
  });
});
