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
// /data/uploads/orgs/<slug>/snapshot/home.json on Fly. S3 backend
// would write the same key — no special-casing needed if/when we
// swap drivers.

import path from "node:path";
import fs from "node:fs/promises";

const ROOT =
  process.env.LOCAL_UPLOADS_DIR ?? path.resolve(process.cwd(), ".local-uploads");

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
  };
  page: {
    heroHeadline: string | null;
    heroLede: string | null;
    customBlocks: unknown;
  } | null;
  memberCount: number;
  heroPhoto: { filename: string; caption: string | null } | null;
};

function snapshotPath(slug: string): string {
  // Keep snapshots co-located with other org-scoped storage so a
  // shared S3-backed adapter can list them under the same prefix.
  return path.join(ROOT, "orgs", slug, "snapshot", "home.json");
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
