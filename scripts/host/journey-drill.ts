// Helpers for scripts/host/journey-drill.sh, the restore drill for
// Lantern trails. Never run against a real database: it adds a test
// family with a scout called Emmett.
//
//   tsx scripts/host/journey-drill.ts seed            # the family, a trail, logs, a note, a photo
//   tsx scripts/host/journey-drill.ts snapshot FILE   # the trail as JSON (export minus timestamps)
//   tsx scripts/host/journey-drill.ts change          # progress made "after the backup"
//   tsx scripts/host/journey-drill.ts check-change    # that progress is there
//   tsx scripts/host/journey-drill.ts lose            # deletes the scout (what a bad migration might do)

import fs from "node:fs";
import { prisma } from "@/lib/db";
import { createScout, applyProgress } from "@/lib/journey/store";
import { addPhotoEntry, applyEntries } from "@/lib/journey/entries";
import { exportTrail } from "@/lib/journey/trail-file";

const EMAIL = "lantern-drill-parent@example.invalid";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function owner() {
  return prisma.user.findUniqueOrThrow({ where: { email: EMAIL }, select: { id: true, email: true } });
}
async function emmett(user: { id: string }) {
  return prisma.journeyScout.findFirstOrThrow({ where: { ownerUserId: user.id }, select: { id: true } });
}

async function seed() {
  // A drill that stopped part way leaves its family behind; start clean
  // (the trail goes with the account).
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  const user = await prisma.user.create({
    data: { email: EMAIL, displayName: "Drill Parent", emailVerified: true },
    select: { id: true, email: true },
  });
  const scout = await createScout(user, {
    name: "Emmett",
    path: ["rank:scout", "rank:tenderfoot", "rank:second-class", "badge:plumbing", "custom:knots1"],
    custom: { "custom:knots1": { key: "custom:knots1", name: "Knots", kind: "custom", reqs: [{ n: "1", t: "Bowline", subs: [] }] } },
    progress: { "rank:scout": true, "rank:tenderfoot#1a": "2026-09-01", "rank:tenderfoot#1b": "2026-09-01", "badge:plumbing#2": "2026-10-02" },
  });
  const ref = { id: scout.id, ownerUserId: user.id };
  await applyEntries(ref, { userId: user.id, role: "parent" }, {
    put: [
      { clientId: "ex1", key: "rank:second-class#7a", kind: "log", day: "2026-10-01", amount: 30, unit: "minutes", text: "Bike ride" },
      { clientId: "ex2", key: "rank:second-class#7a", kind: "log", day: "2026-10-02", amount: 45, unit: "minutes" },
      { clientId: "n1", key: "badge:plumbing#3", kind: "note", text: "Fixed the kitchen tap with Dad" },
    ],
    remove: [],
  });
  await addPhotoEntry(ref, { userId: null, role: "scout" }, { clientId: "ph1", key: "badge:plumbing#4", text: "The trap" }, PNG, "image/png");
  console.log(`seeded Emmett (${scout.id})`);
}

async function snapshot(out: string) {
  const user = await owner();
  const { file, photos } = await exportTrail(user, (await emmett(user)).id, { photos: true });
  // Ids and times change on a re-import; what matters is the trail itself.
  const trail = {
    scout: { ...file.scout, id: undefined },
    entries: file.entries.map((e) => ({ ...e, updatedAt: undefined })),
    photos: Object.fromEntries([...photos].map(([k, v]) => [k, v.toString("base64")])),
  };
  fs.writeFileSync(out, JSON.stringify(trail, null, 2));
  console.log(`${Object.keys(file.scout.progress).length} steps, ${file.entries.length} entries, ${photos.size} photos`);
}

async function change() {
  const user = await owner();
  const id = (await emmett(user)).id;
  await applyProgress(user, id, [{ key: "rank:second-class#1a", done: true, on: "2026-10-17" }]);
  await applyEntries({ id, ownerUserId: user.id }, { userId: user.id, role: "parent" }, {
    put: [{ clientId: "after1", key: "rank:second-class#7a", kind: "log", day: "2026-10-17", amount: 60, unit: "minutes", text: "After the backup" }],
    remove: [],
  });
}

async function checkChange() {
  const user = await owner();
  const id = (await emmett(user)).id;
  const step = await prisma.journeyProgress.findUnique({ where: { scoutId_key: { scoutId: id, key: "rank:second-class#1a" } } });
  const entry = await prisma.journeyEntry.findUnique({ where: { scoutId_clientId: { scoutId: id, clientId: "after1" } } });
  if (!step || !entry) throw new Error(`progress made after the backup is missing (step: ${!!step}, log: ${!!entry})`);
  console.log("progress made after the backup is there");
}

async function lose() {
  const user = await owner();
  await prisma.journeyScout.deleteMany({ where: { ownerUserId: user.id } });
}

const [cmd, arg] = process.argv.slice(2);
const run: Record<string, () => Promise<void>> = {
  seed,
  snapshot: () => snapshot(arg ?? "trail.json"),
  change,
  "check-change": checkChange,
  lose,
};
if (!run[cmd]) {
  console.error("usage: journey-drill.ts seed|snapshot FILE|change|check-change|lose");
  process.exit(2);
}
run[cmd]()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await prisma.$disconnect();
    process.exit(1);
  });
