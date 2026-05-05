import { describe, expect, it } from "vitest";
import { dueWindows, REMINDER_WINDOWS } from "./ypt-reminder";

const NOW = new Date("2026-05-05T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

describe("ypt-reminder/dueWindows", () => {
  it("returns [] when expiry is null", () => {
    expect(dueWindows({ yptCurrentUntil: null, now: NOW })).toEqual([]);
  });

  it("returns [] when already expired", () => {
    expect(dueWindows({ yptCurrentUntil: day(-5), now: NOW })).toEqual([]);
  });

  it("returns [] when far outside the largest window", () => {
    expect(dueWindows({ yptCurrentUntil: day(120), now: NOW })).toEqual([]);
  });

  it("emits 60 when inside 60d but outside 30d", () => {
    expect(dueWindows({ yptCurrentUntil: day(45), now: NOW })).toEqual([60]);
  });

  it("emits 30 when inside 30d but outside 7d", () => {
    expect(dueWindows({ yptCurrentUntil: day(20), now: NOW })).toEqual([30]);
  });

  it("emits 7 when inside the final 7d", () => {
    expect(dueWindows({ yptCurrentUntil: day(3), now: NOW })).toEqual([7]);
  });

  it("does not re-fire a window that already fired", () => {
    expect(
      dueWindows({
        yptCurrentUntil: day(45),
        now: NOW,
        alreadyReminded: new Set([60]),
      }),
    ).toEqual([]);
  });

  it("does not backfill: already-reminded 60d at 5d out → no new reminder unless 7d also pending", () => {
    // At 5d out, the active window is 7. If 7 hasn't been sent, it should fire.
    expect(
      dueWindows({
        yptCurrentUntil: day(5),
        now: NOW,
        alreadyReminded: new Set([60, 30]),
      }),
    ).toEqual([7]);
  });

  it("REMINDER_WINDOWS is the 60/30/7 set", () => {
    expect(REMINDER_WINDOWS).toEqual([60, 30, 7]);
  });
});
