/**
 * Tenant provisioning.
 *
 * Validates a signup payload, derives a slug, and inserts a new tenant
 * record into the tenants store. Returns the created tenant.
 *
 * In Phase 3 this will move to a real database with side effects:
 *   - reserve a subdomain in DNS
 *   - request a TLS cert
 *   - seed per-tenant calendar / pages / starter content
 *   - send the founding-leader an invitation email
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TENANTS_FILE = path.join(__dirname, "tenants.json");

const REQUIRED = [
  "unitType",
  "unitNumber",
  "charterOrg",
  "city",
  "state",
  "scoutmasterName",
  "scoutmasterEmail",
];

const VALID_UNIT_TYPES = ["Troop", "Pack", "Crew", "Ship", "Post"];

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
  return errors;
}

export function deriveSlug(unitType, unitNumber) {
  const t = String(unitType).toLowerCase();
  const n = String(unitNumber).toLowerCase().replace(/\s+/g, "");
  return `${t}${n}`;
}

export function provisionTenant(input, data) {
  const slug = deriveSlug(input.unitType, input.unitNumber);

  if (data.reservedSlugs?.includes(slug)) {
    throw new Error(`The slug "${slug}" is reserved. Please contact support.`);
  }
  if (data.tenants[slug]) {
    throw new Error(`A site already exists at ${slug}.scouthosting.com.`);
  }

  const tenant = {
    slug,
    unitType: input.unitType,
    unitNumber: String(input.unitNumber),
    displayName: `${input.unitType} ${input.unitNumber}`,
    tagline: input.tagline?.trim() || "",
    charterOrg: input.charterOrg.trim(),
    city: input.city.trim(),
    state: input.state.trim(),
    council: input.council?.trim() || "",
    district: input.district?.trim() || "",
    founded: input.founded?.trim() || "",
    meetingDay: input.meetingDay?.trim() || "Mondays",
    meetingTime: input.meetingTime?.trim() || "7:00 PM",
    meetingLocation: input.meetingLocation?.trim() || input.charterOrg.trim(),
    scoutmasterName: input.scoutmasterName.trim(),
    scoutmasterEmail: input.scoutmasterEmail.trim().toLowerCase(),
    committeeChairEmail: input.committeeChairEmail?.trim().toLowerCase() || "",
    primaryColor: input.primaryColor || "#1d6b39",
    accentColor: input.accentColor || "#caa54a",
    plan: input.plan || "patrol",
    isDemo: false,
    createdAt: new Date().toISOString(),
  };

  data.tenants[slug] = tenant;
  return tenant;
}

/* ------------------------------------------------------------------ */
/* CLI mode: `node server/provision.js path/to/config.json`            */
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
  const data = JSON.parse(fs.readFileSync(TENANTS_FILE, "utf8"));
  try {
    const tenant = provisionTenant(input, data);
    fs.writeFileSync(TENANTS_FILE, JSON.stringify(data, null, 2));
    console.log(`✓ Provisioned ${tenant.displayName}`);
    console.log(`  URL:    https://${tenant.slug}.scouthosting.com`);
    console.log(`  Slug:   ${tenant.slug}`);
    console.log(`  Plan:   ${tenant.plan}`);
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exit(3);
  }
}
