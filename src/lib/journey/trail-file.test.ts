import { describe, expect, it } from "vitest";
import { BadZip, unzip, zip } from "./zip";
import { xlsx } from "./xlsx";
import { parseTrailUpload, stepsOf, trailSheets, trailZip, type TrailFile } from "./trail-file";
import { ApiError } from "@/lib/api/v1";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const file = (over: Partial<TrailFile["scout"]> = {}, entries: TrailFile["entries"] = []): TrailFile => ({
  format: "lantern-trail",
  version: 1,
  exportedAt: "2026-10-17T05:00:00.000Z",
  source: "compass",
  scout: {
    id: "s1",
    name: "Emmett",
    path: ["rank:scout", "rank:tenderfoot", "custom:k1"],
    custom: { "custom:k1": { key: "custom:k1", name: "Knots", kind: "custom", reqs: [{ n: "1", t: "Tie a bowline", subs: [] }] } },
    progress: { "rank:scout": true, "rank:tenderfoot#1a": "2026-10-01", "custom:k1#1": "2026-10-02" },
    checkedBy: { "custom:k1#1": "scout" },
    ...over,
  },
  entries,
});

const entry = (id: string, over: Partial<TrailFile["entries"][number]> = {}): TrailFile["entries"][number] => ({
  id,
  key: "rank:second-class#7a",
  kind: "log",
  day: "2026-10-03",
  amount: 30,
  unit: "minutes",
  text: "=SUM(A1) ran laps",
  by: "scout",
  createdAt: "2026-10-03T10:00:00.000Z",
  updatedAt: "2026-10-03T10:00:00.000Z",
  photo: null,
  ...over,
});

describe("zip", () => {
  it("round-trips stored and deflated files", () => {
    const z = zip([
      { name: "a.txt", data: Buffer.from("hello hello hello hello") },
      { name: "photos/ü.png", data: PNG, store: true },
    ]);
    const out = unzip(z, { maxFiles: 10, maxBytes: 1e6 });
    expect(out.get("a.txt")?.toString()).toBe("hello hello hello hello");
    expect(out.get("photos/ü.png")?.equals(PNG)).toBe(true);
  });

  it("refuses junk, too many files and too much unpacked data", () => {
    expect(() => unzip(Buffer.from("not a zip at all, no"), { maxFiles: 10, maxBytes: 1e6 })).toThrow(BadZip);
    const z = zip([{ name: "a", data: Buffer.alloc(10_000) }, { name: "b", data: Buffer.alloc(10) }]);
    expect(() => unzip(z, { maxFiles: 1, maxBytes: 1e6 })).toThrow(/too many/);
    expect(() => unzip(z, { maxFiles: 10, maxBytes: 5000 })).toThrow(/too large/);
  });

  it("catches a damaged file", () => {
    const z = zip([{ name: "a.txt", data: Buffer.from("abcdef"), store: true }]);
    z[30 + 5 + 2] ^= 0xff; // a byte of the stored data
    expect(() => unzip(z, { maxFiles: 10, maxBytes: 1e6 })).toThrow(/damaged/);
  });
});

describe("xlsx", () => {
  it("is a workbook with one part per sheet and text kept as text", () => {
    const parts = unzip(xlsx([{ name: "Log/1", rows: [["Note"], ["=1+1 <b>"], [42]] }]), { maxFiles: 20, maxBytes: 1e6 });
    expect([...parts.keys()]).toEqual(
      expect.arrayContaining(["[Content_Types].xml", "xl/workbook.xml", "xl/styles.xml", "xl/worksheets/sheet1.xml"]),
    );
    const sheet = parts.get("xl/worksheets/sheet1.xml")!.toString();
    expect(sheet).toContain('t="inlineStr"><is><t xml:space="preserve">=1+1 &lt;b&gt;</t>');
    expect(sheet).toContain("<v>42</v>");
    expect(sheet).not.toContain("<f>");
    expect(parts.get("xl/workbook.xml")!.toString()).toContain('name="Log 1"');
  });
});

describe("trail spreadsheet", () => {
  it("lists the trail, its steps and the logs", () => {
    const catalog = new Map([
      ["rank:tenderfoot", { key: "rank:tenderfoot", name: "Tenderfoot", kind: "rank" as const, reqs: [{ n: "1", t: "Camp", subs: [{ id: "1a", t: "Pack" }, { id: "1b", t: "Sleep" }] }] }],
    ]);
    const [trail, steps, log] = trailSheets(file({}, [entry("e1")]), catalog);
    expect(trail.rows[1]).toEqual([1, "Scout", "Rank", "Earned", 0, null]);
    expect(trail.rows[2]).toEqual([2, "Tenderfoot", "Rank", "In progress", 1, 2]);
    expect(trail.rows[3]).toEqual([3, "Knots", "Own steps", "Earned", 1, 1]);
    expect(steps.rows).toContainEqual(["Tenderfoot", "1a", "Pack", "2026-10-01", "Grown-up"]);
    expect(steps.rows).toContainEqual(["Tenderfoot", "1b", "Sleep", "", ""]);
    expect(steps.rows).toContainEqual(["Knots", "1", "Tie a bowline", "2026-10-02", "Emmett"]);
    expect(log.rows[1]).toEqual(["2026-10-03", "Second Class", "7a", "Log", 30, "minutes", "=SUM(A1) ran laps", "", "Emmett"]);
  });

  it("numbers repeated requirement ids the way Lantern does", () => {
    expect(stepsOf({ reqs: [{ n: "A", t: "", subs: [{ id: "2a", t: "x" }] }, { n: "B", t: "", subs: [{ id: "2a", t: "y" }] }] }).map((s) => s.key)).toEqual(["2a", "2a~2"]);
  });
});

describe("reading a trail file", () => {
  const read = (v: unknown) => parseTrailUpload(Buffer.isBuffer(v) ? v : Buffer.from(JSON.stringify(v)));

  it("reads the JSON download", () => {
    const t = read(file({}, [entry("e1")]));
    expect(t.name).toBe("Emmett");
    expect(t.path).toEqual(["rank:scout", "rank:tenderfoot", "custom:k1"]);
    expect(t.progress).toEqual(file().scout.progress);
    expect([...t.byScout]).toEqual(["custom:k1#1"]);
    expect(t.entries).toHaveLength(1);
    expect(t.skipped).toBe(0);
  });

  it("reads the zip download with its photos, even when re-zipped into a folder", () => {
    const f = file({}, [entry("p1", { kind: "photo", amount: null, unit: null, photo: { file: "photos/p1.png", mimeType: "image/png" } })]);
    const t = read(trailZip(f, new Map([["photos/p1.png", PNG]])));
    expect(t.entries[0].photoBytes?.equals(PNG)).toBe(true);
    expect(t.entries[0].photoMime).toBe("image/png");
    const nested = zip([
      { name: "Emmett copy/trail.json", data: Buffer.from(JSON.stringify(f)) },
      { name: "Emmett copy/photos/p1.png", data: PNG },
    ]);
    expect(read(nested).entries[0].photoBytes?.equals(PNG)).toBe(true);
  });

  it("keeps a photo entry's words when the photo isn't in the file, and skips what it can't read", () => {
    const t = read(
      file({ path: ["rank:scout", "bad key", "rank:scout"], progress: { "rank:scout": true, "nope": true, "rank:star#1": "yesterday" } }, [
        entry("p1", { kind: "photo", text: "at camp", photo: { file: "photos/p1.jpg", mimeType: "image/jpeg" } }),
        entry("p2", { kind: "photo", text: null, photo: { file: "photos/p2.jpg", mimeType: "image/jpeg" } }),
        entry("e1", { kind: "log", amount: null }),
        { id: "../x" } as never,
      ]),
    );
    expect(t.path).toEqual(["rank:scout"]);
    expect(t.progress).toEqual({ "rank:scout": true });
    expect(t.entries.map((e) => [e.id, e.kind])).toEqual([["p1", "note"]]);
    expect(t.skipped).toBe(2 + 2 + 3);
  });

  it("refuses anything that isn't a trail file", () => {
    for (const v of [Buffer.from("{nope"), { format: "other", version: 1, scout: {} }, { format: "lantern-trail", version: 2, scout: {} }, zip([{ name: "x.json", data: Buffer.from("{}") }])]) {
      expect(() => read(v)).toThrow(ApiError);
    }
  });
});
