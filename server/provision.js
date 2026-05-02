/**
 * Org provisioning.
 *
 * Validates a signup payload, derives a slug, and inserts an Org row.
 * Used by both the HTTP signup handler and a CLI for bulk provisioning.
 *
 * Phase 4+ will extend this to:
 *   - reserve a subdomain (DNS) and request a TLS cert
 *   - send a setup email to the founding leader
 *   - seed starter pages, calendar entries, and forms
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

import { prisma } from "../lib/db.js";
import { UNIT_TYPES, buildSeedSubgroups } from "../lib/orgRoles.js";

const __filename = fileURLToPath(import.meta.url);

const REQUIRED = [
  "unitType",
  "unitNumber",
  "charterOrg",
  "city",
  "state",
  "scoutmasterName",
  "scoutmasterEmail",
];

const VALID_UNIT_TYPES = UNIT_TYPES;
const VALID_PLANS = ["patrol", "troop", "council"];

const RESERVED_SLUGS = new Set([
  "www", "admin", "api", "app", "assets", "blog", "console",
  "dashboard", "demo", "docs", "help", "login", "mail", "marketing",
  "compass", "scouthosting", "signup", "static", "status", "support",
]);

export function validateProvisionInput(body = {}) {
  const errors = [];
  for (const key of REQUIRED) {
    if (!body[key] || String(body[key]).trim() === "") {
      errors.push(`Missing required field: ${key}`);
    }
  }
  if (body.unitType && !VALID_UNIT_TYPES.includes(body.unitType)) {
    errors.push(`unitType must be one of: ${VALID_UNIT_TYPES.join(", ")}`);
  }
  if (body.unitNumber && !/^\d{1,5}[A-Z]?$/i.test(body.unitNumber)) {
    errors.push("unitNumber must be 1–5 digits, optionally followed by a letter.");
  }
  if (body.scoutmasterEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.scoutmasterEmail)) {
    errors.push("scoutmasterEmail must be a valid email address.");
  }
  if (body.plan && !VALID_PLANS.includes(body.plan)) {
    errors.push(`plan must be one of: ${VALID_PLANS.join(", ")}`);
  }
  return errors;
}

// Per-unit-type slug + display prefix. Girl Scout troops use "gstroop"
// so a town can host both Troop 12 (Scouts BSA) and Girl Scout Troop 12
// without subdomain collision; their display name expands likewise so
// "GirlScoutTroop 12" never leaks into emails or page titles.
const UNIT_TYPE_META = {
  Troop:          { slug: "troop",   display: "Troop" },
  Pack:           { slug: "pack",    display: "Pack" },
  Crew:           { slug: "crew",    display: "Crew" },
  Ship:           { slug: "ship",    display: "Ship" },
  Post:           { slug: "post",    display: "Post" },
  GirlScoutTroop: { slug: "gstroop", display: "Girl Scout Troop" },
};

export function deriveSlug(unitType, unitNumber) {
  const prefix = UNIT_TYPE_META[unitType]?.slug || String(unitType).toLowerCase();
  const n = String(unitNumber).toLowerCase().replace(/\s+/g, "");
  return `${prefix}${n}`;
}

export function formatDisplayName(unitType, unitNumber) {
  const prefix = UNIT_TYPE_META[unitType]?.display || String(unitType);
  return `${prefix} ${unitNumber}`;
}

// Persist the canonical Subgroup rows for a freshly-provisioned org.
// Idempotent (skipDuplicates) so re-running on an existing org is safe.
async function persistSeedSubgroups(org) {
  const seeds = buildSeedSubgroups(org.unitType);
  if (!seeds.length) return;
  await prisma.subgroup.createMany({
    data: seeds.map((s) => ({ ...s, orgId: org.id })),
    skipDuplicates: true,
  });
}

/**
 * Create an Org record. Throws if the slug is reserved or already in use.
 * Caller is responsible for catching and translating to an HTTP error.
 */
export async function provisionOrg(input) {
  const slug = deriveSlug(input.unitType, input.unitNumber);

  if (RESERVED_SLUGS.has(slug)) {
    throw new Error(`The slug "${slug}" is reserved. Please contact support.`);
  }

  const existing = await prisma.org.findUnique({ where: { slug } });
  if (existing) {
    const apex = process.env.APEX_DOMAIN || "compass.app";
    throw new Error(`A site already exists at ${slug}.${apex}.`);
  }

  const charterOrg = input.charterOrg.trim();

  // 60-day free trial set at provision time. The Stripe webhook only
  // takes over once the leader actually checks out; until then,
  // lib/billingState.js gates write access on trialEndsAt.
  const TRIAL_DAYS = 60;
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  const org = await prisma.org.create({
    data: {
      trialEndsAt,
      subscriptionStatus: "trialing",
      slug,
      unitType: input.unitType,
      unitNumber: String(input.unitNumber),
      displayName: formatDisplayName(input.unitType, input.unitNumber),
      tagline: input.tagline?.trim() || null,
      charterOrg,
      city: input.city.trim(),
      state: input.state.trim(),
      council: input.council?.trim() || null,
      district: input.district?.trim() || null,
      founded: input.founded?.trim() || null,
      meetingDay: input.meetingDay?.trim() || "Mondays",
      meetingTime: input.meetingTime?.trim() || "7:00 PM",
      meetingLocation: input.meetingLocation?.trim() || charterOrg,
      scoutmasterName: input.scoutmasterName.trim(),
      scoutmasterEmail: input.scoutmasterEmail.trim().toLowerCase(),
      committeeChairEmail: input.committeeChairEmail?.trim().toLowerCase() || null,
      primaryColor: input.primaryColor || "#1d6b39",
      accentColor: input.accentColor || "#caa54a",
      plan: input.plan || "patrol",
      isDemo: !!input.isDemo,
    },
  });

  await persistSeedSubgroups(org);
  return org;
}

/* ------------------------------------------------------------------ */
/* CLI: `node server/provision.js path/to/config.json`                 */
/* ------------------------------------------------------------------ */

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  const configPath = process.argv[2];
  if (!configPath) {
    console.error("usage: node server/provision.js <config.json>");
    process.exit(1);
  }
  const input = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const errors = validateProvisionInput(input);
  if (errors.length) {
    console.error("Invalid config:");
    for (const e of errors) console.error("  -", e);
    process.exit(2);
  }
  try {
    const org = await provisionOrg(input);
    console.log(`✓ Provisioned ${org.displayName}`);
    console.log(`  URL:    https://${org.slug}.${process.env.APEX_DOMAIN || "compass.app"}`);
    console.log(`  Slug:   ${org.slug}`);
    console.log(`  Plan:   ${org.plan}`);
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exit(3);
  } finally {
    await prisma.$disconnect();
  }
}
