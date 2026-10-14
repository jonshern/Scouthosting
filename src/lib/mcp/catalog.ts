// The requirement catalog the connector explains progress against:
// every rank and merit badge, with requirement text and the ids
// RequirementProgress uses ("badge:plumbing#6b").
//
// The catalog belongs to @scout-core/catalog (jonshern/scout-core,
// private) and Compass is public, so it is not copied into this repo.
// Point CATALOG_PATH at a compiled catalog.json instead:
//
//   scout-core:      packages/catalog/dist/catalog.json (npm run build)
//   emmett-scouting: content/catalog.json
//
// Without it the connector still answers from the ids and statuses it
// has; it just can't name requirements or say what's left.

import fs from "node:fs";
import { logger } from "@/lib/log";

export type CatalogSub = { id: string; t: string };
export type CatalogReq = { n: string; t: string; choose?: number; subs: CatalogSub[] };
export type CatalogItem = {
  key: string;
  name: string;
  /** "custom" is a family's own Lantern item. */
  kind: "rank" | "badge" | "award" | "custom";
  eagle?: boolean;
  retired?: string;
  formerly?: string | string[];
  official?: string;
  worksheet?: string;
  reqs: CatalogReq[];
};
export type Catalog = { ranks: CatalogItem[]; badges: CatalogItem[] };

export const RANK_ORDER = [
  "rank:scout",
  "rank:tenderfoot",
  "rank:second-class",
  "rank:first-class",
  "rank:star",
  "rank:life",
  "rank:eagle",
] as const;

/** Rank names, so the connector can name ranks even without a catalog. */
export const RANK_NAMES: Record<string, string> = {
  "rank:scout": "Scout",
  "rank:tenderfoot": "Tenderfoot",
  "rank:second-class": "Second Class",
  "rank:first-class": "First Class",
  "rank:star": "Star",
  "rank:life": "Life",
  "rank:eagle": "Eagle",
};

/** Eagle-required badges where earning any one of the group counts. */
export const EAGLE_CHOICE_GROUPS: string[][] = [
  ["badge:emergency-preparedness", "badge:lifesaving"],
  ["badge:environmental-science", "badge:sustainability"],
  ["badge:cycling", "badge:hiking", "badge:swimming"],
];

const log = logger.child("mcp-catalog");

let cached: { path: string; mtimeMs: number; catalog: Catalog } | null = null;
let override: Catalog | null | undefined;

/** Tests set a catalog directly; pass undefined to go back to CATALOG_PATH. */
export function setCatalogForTests(c: Catalog | null | undefined) {
  override = c;
}

function valid(c: unknown): c is Catalog {
  const o = c as Catalog;
  return !!o && Array.isArray(o.ranks) && Array.isArray(o.badges) && o.badges.every((b) => typeof b.key === "string" && Array.isArray(b.reqs));
}

export function loadCatalog(): Catalog | null {
  if (override !== undefined) return override;
  const path = process.env.CATALOG_PATH?.trim();
  if (!path) return null;
  try {
    const { mtimeMs } = fs.statSync(path);
    if (cached && cached.path === path && cached.mtimeMs === mtimeMs) return cached.catalog;
    const parsed = JSON.parse(fs.readFileSync(path, "utf8"));
    if (!valid(parsed)) {
      log.warn("CATALOG_PATH is not a catalog.json", { path });
      return null;
    }
    cached = { path, mtimeMs, catalog: parsed };
    return parsed;
  } catch (err) {
    log.warn("could not read CATALOG_PATH", { path, err: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export function itemIndex(c: Catalog | null): Map<string, CatalogItem> {
  const m = new Map<string, CatalogItem>();
  if (!c) return m;
  for (const i of [...c.ranks, ...c.badges]) m.set(i.key, i);
  return m;
}

/** "Citizenship in the Community" / "First Aid merit badge" → "citizenship-in-the-community". */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(merit badge|rank)\b/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** A badge key from a free-form name (Scoutbook export, court of honor list), using names and former names. */
export function badgeKeyForName(name: string, c: Catalog | null): string {
  const slug = slugify(name);
  if (c) {
    for (const b of c.badges) {
      const names = [b.name, ...(Array.isArray(b.formerly) ? b.formerly : b.formerly ? [b.formerly] : [])];
      if (names.some((n) => slugify(n) === slug)) return b.key;
    }
  }
  return `badge:${slug}`;
}

export function rankKeyForName(name: string): string | null {
  const slug = slugify(name);
  const key = `rank:${slug}`;
  return (RANK_ORDER as readonly string[]).includes(key) ? key : null;
}

/** A name for an item key even when the catalog doesn't have it. */
export function itemName(key: string, idx: Map<string, CatalogItem>): string {
  const hit = idx.get(key);
  if (hit) return hit.name;
  if (RANK_NAMES[key]) return RANK_NAMES[key];
  const slug = key.split(":")[1] ?? key;
  return slug.replace(/-/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}
