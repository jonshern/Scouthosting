#!/usr/bin/env node
// One-time backfill: create a Channel(kind="broadcast") for every
// existing Subgroup, copying its rules into Channel.autoAddRules.
//
// This is the bridge between the old Subgroup model (rule-based audience
// for newsletters / broadcasts) and the unified Channel-with-autoAddRules
// model from PR-C0. Run once after deploying PR-C0's schema migration.
// Safe to re-run: existing matching Channels are detected and skipped.
//
// Usage:
//   node scripts/backfill-channels-from-subgroups.js          # all orgs
//   node scripts/backfill-channels-from-subgroups.js troop100 # one org slug
//   node scripts/backfill-channels-from-subgroups.js --dry-run
//
// What this DOESN'T do:
//   - Materialize ChannelMember rows. Broadcast targeting reads
//     autoAddRules and filters Members at send time; persisted membership
//     is unnecessary and would lose Members-without-User-accounts.
//   - Repoint admin broadcast UI from Subgroup to Channel — that's PR-C2.
//   - Delete the Subgroup rows. Subgroup stays as the source of truth
//     until PR-C2 cuts the UI over.

import { prisma } from "../lib/db.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const orgSlug = args.find((a) => !a.startsWith("--")) || null;

const where = orgSlug ? { slug: orgSlug } : {};
const orgs = await prisma.org.findMany({ where, select: { id: true, slug: true } });

if (!orgs.length) {
  console.error(orgSlug ? `No org with slug "${orgSlug}".` : "No orgs found.");
  process.exit(1);
}

let created = 0;
let skipped = 0;

for (const org of orgs) {
  const subgroups = await prisma.subgroup.findMany({
    where: { orgId: org.id },
    orderBy: { name: "asc" },
  });
  if (!subgroups.length) {
    console.log(`[${org.slug}] no subgroups`);
    continue;
  }

  for (const sg of subgroups) {
    // Build the autoAddRules JSON. Drop empty arrays and null isYouth so
    // the persisted shape mirrors what describeSubgroup() would say —
    // makes diffs easier and keeps the JSON column small.
    const rules = {};
    if (sg.isYouth != null) rules.isYouth = sg.isYouth;
    if (sg.patrols?.length) rules.patrols = sg.patrols;
    if (sg.skills?.length) rules.skills = sg.skills;
    if (sg.interests?.length) rules.interests = sg.interests;
    if (sg.trainings?.length) rules.trainings = sg.trainings;

    // Idempotency: skip if a broadcast Channel with the same name already
    // exists for this org (e.g. from a previous run, or hand-created).
    const existing = await prisma.channel.findFirst({
      where: { orgId: org.id, kind: "broadcast", name: sg.name },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      console.log(`[${org.slug}] skip "${sg.name}" — channel ${existing.id} already exists`);
      continue;
    }

    if (dryRun) {
      console.log(`[${org.slug}] would create Channel "${sg.name}" with rules ${JSON.stringify(rules)}`);
      created++;
      continue;
    }

    const ch = await prisma.channel.create({
      data: {
        orgId: org.id,
        kind: "broadcast",
        name: sg.name,
        purpose: sg.description ?? null,
        autoAddRules: Object.keys(rules).length ? rules : null,
        postPolicy: "members",
      },
      select: { id: true },
    });
    created++;
    console.log(`[${org.slug}] created Channel ${ch.id} from Subgroup ${sg.id} ("${sg.name}")`);
  }
}

console.log(`\nDone. ${created} created${dryRun ? " (dry run)" : ""}, ${skipped} skipped.`);

await prisma.$disconnect();
