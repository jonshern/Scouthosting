import { describe, expect, it } from "vitest";
import { readyForCourtOfHonor, requirementText } from "./unit";
import type { Catalog } from "@/lib/mcp/catalog";
import type { JourneySummary } from "@/lib/mcp/journey";

const catalog: Catalog = {
  ranks: [{ key: "rank:tenderfoot", name: "Tenderfoot", kind: "rank", reqs: [{ n: "1", t: "Show your gear", subs: [{ id: "1a", t: "Pack for an overnight" }] }] }],
  badges: [{ key: "badge:first-aid", name: "First Aid", kind: "badge", eagle: true, reqs: [{ n: "2", t: "Explain shock", subs: [] }] }],
};

const now = new Date("2026-11-08T12:00:00Z");
const summary = (over: Partial<JourneySummary>): JourneySummary => ({
  catalogLoaded: true,
  rank: null,
  nextRank: null,
  badgesEarned: [],
  badgesInProgress: [],
  eagle: null,
  trail: null,
  unknownRequirementIds: [],
  ...over,
});

describe("requirementText", () => {
  it("names the item and finds the words", () => {
    expect(requirementText(catalog, "rank:tenderfoot#1a")).toEqual({ item: "Tenderfoot", number: "1a", text: "Pack for an overnight" });
    expect(requirementText(catalog, "badge:first-aid#2")).toEqual({ item: "First Aid", number: "2", text: "Explain shock" });
  });
  it("still names an item without a catalog", () => {
    expect(requirementText(null, "badge:game-design#3-optB")).toEqual({ item: "Game Design", number: "3 (option B)", text: null });
  });
});

describe("readyForCourtOfHonor", () => {
  const s = (sum: JourneySummary) => ({ memberId: "m1", name: "Alex Smith", summary: sum });
  it("lists a recent rank and badge not yet presented", () => {
    const out = readyForCourtOfHonor(
      s(
        summary({
          rank: { key: "rank:tenderfoot", name: "Tenderfoot", since: new Date("2026-10-01"), source: "requirements" },
          badgesEarned: [{ key: "badge:first-aid", name: "First Aid", eagle: true, earnedAt: new Date("2026-09-01"), source: "scoutbook" }],
        }),
      ),
      [],
      catalog,
      now,
    );
    expect(out.map((r) => r.award)).toEqual(["Tenderfoot rank", "First Aid merit badge"]);
  });
  it("skips what's been presented, what's old, and Lantern-only checks", () => {
    const out = readyForCourtOfHonor(
      s(
        summary({
          rank: { key: "rank:tenderfoot", name: "Tenderfoot", since: new Date("2026-10-01"), source: "requirements" },
          badgesEarned: [
            { key: "badge:first-aid", name: "First Aid", eagle: true, earnedAt: new Date("2026-09-01"), source: "requirements" },
            { key: "badge:hiking", name: "Hiking", eagle: true, earnedAt: new Date("2024-01-01"), source: "scoutbook" },
            { key: "badge:pets", name: "Pets", eagle: false, earnedAt: new Date("2026-10-01"), source: "lantern" },
          ],
        }),
      ),
      [
        { award: "Tenderfoot rank", category: "Rank" },
        { award: "First Aid merit badge", category: "Merit Badge" },
      ],
      catalog,
      now,
    );
    expect(out).toEqual([]);
  });
});
