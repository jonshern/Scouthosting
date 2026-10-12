// Event fields the phone app's calendar and event screens show,
// computed the same way the website does.

import type { PrismaClient } from "@prisma/client";
import { categoryMeta, loadOrgCategories, resolveCategoryStyle, type CustomCategoryMap } from "@/lib/calendar/categories";

export { loadOrgCategories };
export type { CustomCategoryMap };

/**
 * Category label and colors. `color` is the semantic palette key
 * ("sky", "accent", …); `categoryColor`/`categoryInk` are hex when the
 * unit customised the category, `var(--key)` on the defaults.
 */
export function eventStyle(category: string | null, custom: CustomCategoryMap | null) {
  const style = resolveCategoryStyle(category, custom);
  return {
    categoryLabel: style.label,
    color: categoryMeta(category).color,
    categoryColor: category ? style.bg : null,
    categoryInk: category ? style.fg : null,
  };
}

export type RsvpCounts = { yes: number; no: number; maybe: number; total: number };

/** yes/no/maybe counts per event. */
export async function rsvpCountsFor(prisma: PrismaClient, eventIds: string[]) {
  const counts = new Map<string, RsvpCounts>();
  if (!eventIds.length) return counts;
  const rows = await prisma.rsvp.groupBy({
    by: ["eventId", "response"],
    where: { eventId: { in: eventIds } },
    _count: { _all: true },
  });
  for (const r of rows) {
    const c = counts.get(r.eventId) ?? { yes: 0, no: 0, maybe: 0, total: 0 };
    if (r.response === "yes" || r.response === "no" || r.response === "maybe") c[r.response] += r._count._all;
    c.total += r._count._all;
    counts.set(r.eventId, c);
  }
  return counts;
}
