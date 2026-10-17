import { describe, expect, it } from "vitest";
import { describeJourney, itemProgress, summarizeJourney, type ProgressRow, type Status } from "./journey";
import type { Catalog, CatalogItem } from "./catalog";

const req = (n: string, t = `req ${n}`, subs: string[] = [], choose?: number) => ({
  n,
  t,
  ...(choose ? { choose } : {}),
  subs: subs.map((id) => ({ id, t: `sub ${id}` })),
});

const tenderfoot: CatalogItem = { key: "rank:tenderfoot", name: "Tenderfoot", kind: "rank", reqs: [req("1"), req("2", "pick two", ["2a", "2b", "2c"], 2)] };
const scout: CatalogItem = { key: "rank:scout", name: "Scout", kind: "rank", reqs: [req("1"), req("2")] };
const firstAid: CatalogItem = { key: "badge:first-aid", name: "First Aid", kind: "badge", eagle: true, reqs: [req("1"), req("2"), req("3"), req("4")] };
const swimming: CatalogItem = { key: "badge:swimming", name: "Swimming", kind: "badge", eagle: true, reqs: [req("1")] };
const hiking: CatalogItem = { key: "badge:hiking", name: "Hiking", kind: "badge", eagle: true, reqs: [req("1")] };
const cycling: CatalogItem = { key: "badge:cycling", name: "Cycling", kind: "badge", eagle: true, reqs: [req("1")] };
const plumbing: CatalogItem = {
  key: "badge:plumbing",
  name: "Plumbing",
  kind: "badge",
  reqs: [req("1"), req("2", "option A or B", ["2a-optA", "2b-optA", "2a-optB"])],
};

const catalog: Catalog = { ranks: [scout, tenderfoot], badges: [firstAid, swimming, hiking, cycling, plumbing] };

const row = (requirementId: string, status: string, signedOffAt: Date | null = null): ProgressRow => ({
  requirementId,
  status,
  signedOffAt,
  updatedAt: new Date("2026-10-01T00:00:00Z"),
});

const statusMap = (m: Record<string, Status>) => (id: string) => m[id];

describe("itemProgress", () => {
  it("counts a 'do 2 of 3' requirement as 2", () => {
    const p = itemProgress(tenderfoot, statusMap({ "rank:tenderfoot#1": "signed_off", "rank:tenderfoot#2a": "signed_off", "rank:tenderfoot#2c": "done" }));
    expect(p.total).toBe(3);
    expect(p.completed).toBe(2);
    expect(p.waiting).toBe(1);
    expect(p.complete).toBe(false);
  });

  it("takes the best option group", () => {
    const p = itemProgress(plumbing, statusMap({ "badge:plumbing#1": "signed_off", "badge:plumbing#2a-optB": "signed_off" }));
    expect(p.total).toBe(2);
    expect(p.completed).toBe(2);
    expect(p.complete).toBe(true);
  });

  it("treats a Lantern check as complete", () => {
    const p = itemProgress(scout, statusMap({ "rank:scout#1": "checked", "rank:scout#2": "signed_off" }));
    expect(p.complete).toBe(true);
  });
});

describe("summarizeJourney", () => {
  it("uses the highest rank from any source and shows the next one", () => {
    const s = summarizeJourney({
      catalog,
      progress: [row("rank:scout#1", "signed_off", new Date("2026-09-01T00:00:00Z")), row("rank:scout#2", "signed_off", new Date("2026-09-02T00:00:00Z"))],
      scoutbook: null,
      awards: [],
    });
    expect(s.rank).toMatchObject({ key: "rank:scout", source: "requirements" });
    expect(s.rank?.since?.toISOString().slice(0, 10)).toBe("2026-09-02");
    expect(s.nextRank?.key).toBe("rank:tenderfoot");
  });

  it("counts earned badges from courts of honor and full sign-offs", () => {
    const s = summarizeJourney({
      catalog,
      progress: [1, 2, 3, 4].map((n) => row(`badge:first-aid#${n}`, "signed_off", new Date("2026-08-01T00:00:00Z"))),
      scoutbook: null,
      awards: [{ award: "Swimming merit badge", category: "Merit Badge", at: new Date("2026-07-01T00:00:00Z") }],
    });
    expect(s.badgesEarned.map((b) => [b.key, b.source])).toEqual([
      ["badge:first-aid", "requirements"],
      ["badge:swimming", "court_of_honor"],
    ]);
    // Swimming fills the cycling / hiking / swimming group.
    expect(s.eagle?.groups.find((g) => g.options.includes("Swimming"))?.earnedWith).toBe("Swimming");
    expect(s.eagle?.earned).toBe(2);
    expect(s.eagle?.total).toBe(2);
  });

  it("merges Lantern checks, whole-item checks and the trail", () => {
    const s = summarizeJourney({
      catalog,
      progress: [row("badge:first-aid#1", "done")],
      scoutbook: null,
      awards: [],
      lantern: {
        path: ["rank:scout", "rank:tenderfoot", "badge:first-aid", "custom:bike-trip"],
        custom: { "custom:bike-trip": { key: "custom:bike-trip", name: "Bike trip", kind: "custom", reqs: [req("1"), req("2")] } },
        checks: new Map<string, string | null>([
          ["rank:scout", "2026-09-10"],
          ["badge:first-aid#1", "2026-10-01"],
          ["badge:first-aid#2", null],
          ["custom:bike-trip#1", "2026-10-05"],
        ]),
      },
    });
    expect(s.rank).toMatchObject({ key: "rank:scout", source: "lantern" });
    const fa = s.badgesInProgress.find((b) => b.key === "badge:first-aid");
    expect(fa).toMatchObject({ completed: 2, total: 4, percent: 50 });
    expect(s.trail?.items.map((i) => [i.key, i.complete])).toEqual([
      ["rank:scout", true],
      ["rank:tenderfoot", false],
      ["badge:first-aid", false],
      ["custom:bike-trip", false],
    ]);
    expect(s.trail?.next).toBe("Tenderfoot");
    expect(s.trail?.items[3].percent).toBe(50);
  });

  it("a troop sign-off wins over a later Lantern uncheck of the same step", () => {
    const s = summarizeJourney({
      catalog,
      progress: [row("rank:scout#1", "signed_off"), row("rank:scout#2", "signed_off")],
      scoutbook: null,
      awards: [],
      lantern: { path: [], custom: {}, checks: new Map() },
    });
    expect(s.rank?.key).toBe("rank:scout");
  });

  it("works without a catalog", () => {
    const s = summarizeJourney({ catalog: null, progress: [row("badge:cooking#1", "done")], scoutbook: null, awards: [] });
    expect(s.catalogLoaded).toBe(false);
    expect(s.eagle).toBeNull();
    expect(s.badgesInProgress[0]).toMatchObject({ key: "badge:cooking", waiting: 1 });
    expect(describeJourney("Emmett", s)).toContain("catalog isn't loaded");
  });

  it("describes the journey in plain words", () => {
    const s = summarizeJourney({
      catalog,
      progress: [row("rank:scout#1", "signed_off"), row("rank:scout#2", "signed_off"), row("rank:tenderfoot#1", "done")],
      scoutbook: null,
      awards: [],
    });
    const text = describeJourney("Emmett", s);
    expect(text).toContain("Emmett's rank is Scout.");
    expect(text).toContain("Toward Tenderfoot: 0 of 3 requirements complete, 1 done and waiting for a sign-off.");
    expect(text).toContain("No merit badges earned yet.");
  });
});
