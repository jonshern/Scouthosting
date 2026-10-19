// Self-serve sign-up: a signed-in adult creates a unit, becomes its
// admin and owner, and the unit starts its free trial with no card
// (lib/billing/trial.ts). Called from /start (server-actions/start-trial.ts).

import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { UNIT_TYPES, type UnitType } from "@/lib/auth/org-roles";
import { RESERVED_SLUGS, deriveSlug, provisionOrg } from "./provision-org";
import { recordAction } from "@/lib/usage/collect";
import { sendWelcome } from "./welcome-mail";
import { refreshUnitChannels } from "@/lib/members/access";
import { captureError } from "@/lib/ops/error-tracker";

export const StartTrialSchema = z
  .object({
    unitType: z.enum(UNIT_TYPES, {
      errorMap: () => ({ message: "Pick your unit type." }),
    }),
    unitNumber: z
      .string()
      .trim()
      .regex(/^\d{1,5}[A-Za-z]?$/, "Unit number is 1 to 5 digits, optionally followed by a letter."),
    charterOrg: z.string().trim().min(2, "Enter your chartered organization.").max(200),
    city: z.string().trim().min(2, "Enter your city.").max(100),
    state: z.string().trim().min(2, "Enter your state.").max(50),
    passphrase: z.string().min(12, "The unit passphrase must be at least 12 characters.").max(200),
    passphraseConfirm: z.string(),
  })
  .refine((v) => v.passphrase === v.passphraseConfirm, {
    message: "The two passphrases don't match.",
    path: ["passphraseConfirm"],
  });

export type StartTrialInput = z.infer<typeof StartTrialSchema>;

function citySlug(city: string): string {
  return city
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

// Unit numbers repeat across councils (there are many Troop 100s), so
// when `troop100` is taken the city goes on the end, then a counter.
export function slugCandidates(unitType: UnitType, unitNumber: string, city: string): string[] {
  const base = deriveSlug(unitType, unitNumber);
  const withCity = citySlug(city) ? `${base}-${citySlug(city)}` : base;
  const out = [base, withCity];
  for (let i = 2; i <= 9; i++) out.push(`${withCity}-${i}`);
  return [...new Set(out)].filter((s) => !RESERVED_SLUGS.has(s));
}

export async function pickAvailableSlug(candidates: string[]): Promise<string | null> {
  const taken = new Set(
    (
      await prisma.org.findMany({
        where: { slug: { in: candidates } },
        select: { slug: true },
      })
    ).map((o) => o.slug),
  );
  return candidates.find((c) => !taken.has(c)) ?? null;
}

export async function startUnitTrial(
  user: { id: string; email: string; displayName: string },
  input: StartTrialInput,
): Promise<{ slug: string; displayName: string; recoveryCode: string; trialEndsAt: Date | null }> {
  const slug = await pickAvailableSlug(
    slugCandidates(input.unitType, input.unitNumber, input.city),
  );
  if (!slug) throw new Error("We couldn't find a free site address for that unit. Contact support.");

  const { org, recoveryCode } = await provisionOrg({
    slug,
    unitType: input.unitType,
    unitNumber: input.unitNumber.toUpperCase(),
    charterOrg: input.charterOrg,
    city: input.city,
    state: input.state,
    scoutmasterName: user.displayName || user.email,
    scoutmasterEmail: user.email,
    passphrase: input.passphrase,
  });

  // The person signing up runs the unit: admin membership plus owner,
  // which carries billing authority.
  await prisma.$transaction([
    prisma.orgMembership.upsert({
      where: { userId_orgId: { userId: user.id, orgId: org.id } },
      create: { userId: user.id, orgId: org.id, role: "admin" },
      update: { role: "admin" },
    }),
    prisma.org.update({ where: { id: org.id }, data: { ownerId: user.id } }),
  ]);

  audit({
    orgId: org.id,
    userId: user.id,
    userDisplay: user.displayName || user.email,
    entityType: "Org",
    entityId: org.id,
    action: "billing.trial_started",
    summary: `Self-serve sign-up; trial ends ${org.trialEndsAt?.toISOString().slice(0, 10) ?? "?"}.`,
  });

  recordAction("unit_created", { product: "compass", userId: user.id, orgId: org.id });
  await refreshUnitChannels(org.id);
  const welcome = await sendWelcome({
    to: user.email,
    name: user.displayName || null,
    org,
    trialEndsAt: org.trialEndsAt,
  });
  if (!welcome.ok) await captureError(new Error(`welcome email failed: ${welcome.error}`));

  return { slug: org.slug, displayName: org.displayName, recoveryCode, trialEndsAt: org.trialEndsAt };
}
