// Disk-snapshot helpers for the public homepage.
//
// Each successful render of /o/<slug>/ writes a snapshot of the
// org+page record to the local-storage backend. If the DB is
// unreachable on a later request, the homepage server component reads
// the snapshot from disk and renders the static shell from that —
// only the live widgets fail open.
//
// Storage key: orgs/<slug>/snapshot/home.json
// Content:    { org, page, memberCount, heroPhoto, capturedAt }
//
// Local storage (`STORAGE_DRIVER=local`) writes under
// <LOCAL_UPLOADS_DIR>/orgs/<slug>/snapshot/home.json. S3 backend
// would write the same key — no special-casing needed if/when we
// swap drivers.

import path from "node:path";
import fs from "node:fs/promises";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";

// Resolved per-call so changes to LOCAL_UPLOADS_DIR (e.g. in tests
// or after an env edit) are picked up without re-importing.
function root(): string {
  return process.env.LOCAL_UPLOADS_DIR ?? path.resolve(process.cwd(), ".local-uploads");
}

export type HomeSnapshot = {
  capturedAt: string; // ISO timestamp
  org: {
    slug: string;
    displayName: string;
    unitType: string;
    unitNumber: string | null;
    council: string | null;
    tagline: string | null;
    charterOrg: string | null;
    city: string | null;
    state: string | null;
    founded: string | null;
    meetingDay: string | null;
    meetingTime: string | null;
    meetingLocation: string | null;
    primaryColor: string | null;
    accentColor: string | null;
    suspendedAt: string | null;
    suspendedReason: string | null;
  };
  page: {
    heroHeadline: string | null;
    heroLede: string | null;
    customBlocks: unknown;
  } | null;
  // Custom-page nav links rendered in the tenant header.
  customPages: Array<{ slug: string; title: string }>;
  memberCount: number;
  heroPhoto: { filename: string; caption: string | null } | null;
};

function snapshotPath(slug: string): string {
  // Keep snapshots co-located with other org-scoped storage so a
  // shared S3-backed adapter can list them under the same prefix.
  return path.join(root(), "orgs", slug, "snapshot", "home.json");
}

export async function writeHomeSnapshot(
  slug: string,
  snapshot: HomeSnapshot,
): Promise<void> {
  const p = snapshotPath(slug);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(snapshot, null, 2), "utf8");
}

export async function readHomeSnapshot(
  slug: string,
): Promise<HomeSnapshot | null> {
  try {
    const raw = await fs.readFile(snapshotPath(slug), "utf8");
    return JSON.parse(raw) as HomeSnapshot;
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "ENOENT"
    ) {
      return null;
    }
    throw err;
  }
}

// Live fetch from Prisma — assembles everything the public homepage
// (and the tenant chrome layout) needs in one go. Wrapped in
// unstable_cache so concurrent renders within the revalidate window
// share the same DB roundtrip. Tagged `org-home-shell` so admin
// publishes can invalidate it.
const fetchHomeSnapshotFromDb = unstable_cache(
  async (slug: string): Promise<HomeSnapshot | null> => {
    const org = await prisma.org.findUnique({
      where: { slug },
      include: {
        page: true,
        customPages: {
          where: { showInNav: true, visibility: "public" },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: { slug: true, title: true },
        },
      },
    });
    if (!org) return null;
    const memberCount = await prisma.member.count({
      where: { orgId: org.id, deletedAt: null },
    });
    const heroPhoto = await prisma.photo
      .findFirst({
        where: { album: { orgId: org.id, visibility: "public" } },
        orderBy: { takenAt: "desc" },
        select: { filename: true, caption: true },
      })
      .catch(() => null);
    return {
      capturedAt: new Date().toISOString(),
      org: {
        slug: org.slug,
        displayName: org.displayName,
        unitType: org.unitType,
        unitNumber: org.unitNumber,
        council: org.council,
        tagline: org.tagline,
        charterOrg: org.charterOrg,
        city: org.city,
        state: org.state,
        founded: org.founded,
        meetingDay: org.meetingDay,
        meetingTime: org.meetingTime,
        meetingLocation: org.meetingLocation,
        primaryColor: org.primaryColor,
        accentColor: org.accentColor,
        suspendedAt: org.suspendedAt ? org.suspendedAt.toISOString() : null,
        suspendedReason: org.suspendedReason,
      },
      page: org.page
        ? {
            heroHeadline: org.page.heroHeadline,
            heroLede: org.page.heroLede,
            customBlocks: org.page.customBlocks,
          }
        : null,
      customPages: org.customPages,
      memberCount,
      heroPhoto,
    };
  },
  ["public", "org-home-shell"],
  { revalidate: 60, tags: ["org-home-shell"] },
);

// DB-down resilient loader. Tries the cached DB query first; on
// failure (DB unreachable, schema mismatch, etc.) falls back to the
// last successful snapshot written to disk. On success, persists a
// fresh snapshot for future fallbacks.
export async function loadHomeSnapshot(slug: string): Promise<HomeSnapshot | null> {
  try {
    const fresh = await fetchHomeSnapshotFromDb(slug);
    if (fresh) {
      // Write-behind: don't await, don't crash the render if disk fails.
      writeHomeSnapshot(slug, fresh).catch(() => {});
    }
    return fresh;
  } catch (err) {
    const stale = await readHomeSnapshot(slug).catch(() => null);
    if (stale) return stale;
    throw err;
  }
}
