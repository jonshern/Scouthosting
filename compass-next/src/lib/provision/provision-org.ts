// Org provisioning. Validates a signup payload, derives a slug,
// inserts the Org row, and seeds broadcast channels + event
// categories. Site-template application from server/provision.js
// is intentionally omitted from this port — the template registry
// (lib/templates/) is itself an Express-only thing; the unit can
// apply one later from /admin/site/template.

import { prisma } from "@/lib/db";
import { UNIT_TYPES, buildSeedBroadcastChannels, type UnitType } from "@/lib/auth/org-roles";

const REQUIRED = [
  "unitType",
  "unitNumber",
  "charterOrg",
  "city",
  "state",
  "scoutmasterName",
  "scoutmasterEmail",
] as const;

const VALID_PLANS = ["patrol", "troop", "council"] as const;

const RESERVED_SLUGS = new Set([
  "www", "admin", "api", "app", "assets", "blog", "console",
  "dashboard", "demo", "docs", "help", "login", "mail", "marketing",
  "compass", "scouthosting", "signup", "static", "status", "support",
]);

const UNIT_TYPE_META: Record<UnitType, { slug: string; display: string }> = {
  Troop: { slug: "troop", display: "Troop" },
  Pack: { slug: "pack", display: "Pack" },
  Crew: { slug: "crew", display: "Crew" },
  Ship: { slug: "ship", display: "Ship" },
  Post: { slug: "post", display: "Post" },
  GirlScoutTroop: { slug: "gstroop", display: "Girl Scout Troop" },
};

export type ProvisionInput = {
  unitType: UnitType;
  unitNumber: string;
  charterOrg: string;
  city: string;
  state: string;
  scoutmasterName: string;
  scoutmasterEmail: string;
  committeeChairEmail?: string | null;
  tagline?: string | null;
  council?: string | null;
  district?: string | null;
  founded?: string | null;
  meetingDay?: string | null;
  meetingTime?: string | null;
  meetingLocation?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  plan?: (typeof VALID_PLANS)[number];
  isDemo?: boolean;
  addOns?: string[];
};

export function validateProvisionInput(body: Partial<ProvisionInput>): string[] {
  const errors: string[] = [];
  for (const key of REQUIRED) {
    if (!body[key] || String(body[key]).trim() === "") {
      errors.push(`Missing required field: ${key}`);
    }
  }
  if (body.unitType && !(UNIT_TYPES as readonly string[]).includes(body.unitType)) {
    errors.push(`unitType must be one of: ${UNIT_TYPES.join(", ")}`);
  }
  if (body.unitNumber && !/^\d{1,5}[A-Z]?$/i.test(body.unitNumber)) {
    errors.push("unitNumber must be 1–5 digits, optionally followed by a letter.");
  }
  if (body.scoutmasterEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.scoutmasterEmail)) {
    errors.push("scoutmasterEmail must be a valid email address.");
  }
  if (body.plan && !(VALID_PLANS as readonly string[]).includes(body.plan)) {
    errors.push(`plan must be one of: ${VALID_PLANS.join(", ")}`);
  }
  return errors;
}

export function deriveSlug(unitType: UnitType, unitNumber: string): string {
  const prefix = UNIT_TYPE_META[unitType]?.slug || String(unitType).toLowerCase();
  const n = String(unitNumber).toLowerCase().replace(/\s+/g, "");
  return `${prefix}${n}`;
}

export function formatDisplayName(unitType: UnitType, unitNumber: string): string {
  const prefix = UNIT_TYPE_META[unitType]?.display || String(unitType);
  return `${prefix} ${unitNumber}`;
}

async function persistSeedBroadcastChannels(org: {
  id: string;
  unitType: string;
}): Promise<void> {
  const seeds = buildSeedBroadcastChannels(org.unitType);
  if (!seeds.length) return;
  await prisma.channel.createMany({
    data: seeds.map((s) => ({
      orgId: org.id,
      kind: "broadcast",
      name: s.name,
      purpose: s.description ?? null,
      autoAddRules: {
        ...(s.audience ? { audience: s.audience } : {}),
        ...(s.isYouth != null ? { isYouth: s.isYouth } : {}),
        ...(s.patrols?.length ? { patrols: s.patrols } : {}),
      },
      postPolicy: "members",
    })),
    skipDuplicates: true,
  });
}

export async function provisionOrg(input: ProvisionInput) {
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
      addOns: Array.isArray(input.addOns) ? input.addOns : ["messaging"],
    },
  });

  await persistSeedBroadcastChannels(org);

  return org;
}
