// Smoke test: snapshot round-trip + ENOENT handling.
//
// The full DB-down behavior is exercised by the homepage e2e — this
// test just ensures the helpers themselves are correct.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { readHomeSnapshot, writeHomeSnapshot } from "./snapshot";

const TMP_ROOT = path.join(os.tmpdir(), `compass-snapshot-test-${Date.now()}`);
const ORIGINAL_LOCAL = process.env.LOCAL_UPLOADS_DIR;

beforeAll(() => {
  process.env.LOCAL_UPLOADS_DIR = TMP_ROOT;
});

afterAll(async () => {
  if (ORIGINAL_LOCAL === undefined) delete process.env.LOCAL_UPLOADS_DIR;
  else process.env.LOCAL_UPLOADS_DIR = ORIGINAL_LOCAL;
  await fs.rm(TMP_ROOT, { recursive: true, force: true });
});

describe("publish/snapshot", () => {
  it("returns null when no snapshot has been written", async () => {
    expect(await readHomeSnapshot("nope")).toBeNull();
  });

  it("round-trips a snapshot through disk", async () => {
    const slug = "troop100";
    const snapshot = {
      capturedAt: new Date().toISOString(),
      org: {
        slug,
        displayName: "Sample Troop 100",
        unitType: "Troop",
        unitNumber: "100",
        council: "Northern Star",
        tagline: "Adventure since forever",
        charterOrg: "Example Charter",
        city: "Anytown",
        state: "MN",
        founded: "1925",
        meetingDay: "Tuesday",
        meetingTime: "7:00 PM",
        meetingLocation: "Scout Hall",
      },
      page: {
        heroHeadline: "Troop 100",
        heroLede: "Modern scouting since 1925.",
        customBlocks: [],
      },
      memberCount: 32,
      heroPhoto: { filename: "abc.jpg", caption: null },
    };
    await writeHomeSnapshot(slug, snapshot);
    const round = await readHomeSnapshot(slug);
    expect(round).toEqual(snapshot);
  });
});
