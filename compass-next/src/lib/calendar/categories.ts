// Event category vocabulary + colour mapping.
//
// Two-layer resolution: per-org admin-managed `EventCategory` rows
// (preferred when available) → hardcoded defaults below (fallback).
// `Event.category` is a free-form string in the schema; this module
// turns it into display metadata so callers don't have to know about
// the per-org table.

import type { PrismaClient } from "@prisma/client";

export type CategoryKey =
  | "meeting"
  | "campout"
  | "service"
  | "ceremony"
  | "court-of-honor"
  | "training"
  | "fundraiser"
  | "trip"
  | "highadventure"
  | "social"
  | "pinewood"
  | "blueandgold";

export const CATEGORIES: Record<CategoryKey, { label: string; color: string }> = {
  meeting: { label: "Meeting", color: "sky" },
  campout: { label: "Campout", color: "accent" },
  service: { label: "Service", color: "teal" },
  ceremony: { label: "Ceremony", color: "raspberry" },
  "court-of-honor": { label: "Court of Honor", color: "raspberry" },
  training: { label: "Training", color: "butter" },
  fundraiser: { label: "Fundraiser", color: "ember" },
  trip: { label: "Trip", color: "plum" },
  highadventure: { label: "High Adventure", color: "plum" },
  social: { label: "Social", color: "butter" },
  pinewood: { label: "Pinewood Derby", color: "raspberry" },
  blueandgold: { label: "Blue & Gold", color: "ember" },
};

export const CATEGORY_KEYS = Object.keys(CATEGORIES) as CategoryKey[];

const SEMANTIC_HEX: Record<string, string> = {
  sky: "#bcd0f4",
  accent: "#caa54a",
  teal: "#5eead4",
  raspberry: "#fda4af",
  butter: "#fef3c7",
  ember: "#fed7aa",
  plum: "#ddd6fe",
  primary: "#1d6b39",
};

export function normaliseCategory(raw: string | null | undefined): CategoryKey | null {
  if (!raw) return null;
  const key = String(raw).toLowerCase().trim().replace(/[\s_]+/g, "-");
  return (key in CATEGORIES ? (key as CategoryKey) : null);
}

export function slugifyCategory(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return String(raw)
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export function categoryMeta(raw: string | null | undefined): { label: string; color: string } {
  const key = normaliseCategory(raw);
  if (key) return { ...CATEGORIES[key] };
  if (raw) return { label: String(raw), color: "primary" };
  return { label: "Event", color: "primary" };
}

export function categoryColor(raw: string | null | undefined): string {
  return categoryMeta(raw).color;
}

export type CustomCategoryMap = Record<string, { label: string; color: string }>;

export function resolveCategoryStyle(
  raw: string | null | undefined,
  customMap: CustomCategoryMap | null = null,
): { label: string; bg: string; fg: string } {
  const slug = slugifyCategory(raw);
  if (customMap && slug && customMap[slug]) {
    const c = customMap[slug];
    return { label: c.label, bg: c.color, fg: pickContrast(c.color) };
  }
  const meta = categoryMeta(raw);
  const lightBg = meta.color === "accent" || meta.color === "butter";
  return {
    label: meta.label,
    bg: `var(--${meta.color})`,
    fg: lightBg ? "var(--ink)" : "#fff",
  };
}

function pickContrast(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return "#fff";
  const v = parseInt(m[1], 16);
  const r = (v >> 16) & 0xff;
  const g = (v >> 8) & 0xff;
  const b = v & 0xff;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? "#0f172a" : "#fff";
}

export async function loadOrgCategories(args: {
  orgId: string;
  prisma: PrismaClient;
}): Promise<CustomCategoryMap> {
  const rows = await args.prisma.eventCategory.findMany({
    where: { orgId: args.orgId },
    orderBy: { sortOrder: "asc" },
  });
  const map: CustomCategoryMap = {};
  for (const r of rows) map[r.slug] = { label: r.label, color: r.color };
  return map;
}

export async function ensureDefaultEventCategories(args: {
  orgId: string;
  prisma: PrismaClient;
}): Promise<void> {
  const count = await args.prisma.eventCategory.count({ where: { orgId: args.orgId } });
  if (count > 0) return;
  const data = CATEGORY_KEYS.map((slug, idx) => ({
    orgId: args.orgId,
    slug,
    label: CATEGORIES[slug].label,
    color: SEMANTIC_HEX[CATEGORIES[slug].color] || SEMANTIC_HEX.primary,
    sortOrder: idx,
  }));
  await args.prisma.eventCategory.createMany({ data, skipDuplicates: true });
}
