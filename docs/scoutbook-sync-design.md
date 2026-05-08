# Scoutbook read-only sync — design doc

Status: **proposed, opportunistic**. This is not a priority track; it
ships only when a credible interface exists. We never become the
source of truth for advancement.

## Strategic position

The roadmap is explicit ([ROADMAP.md](../ROADMAP.md) §"Scoutbook
integration"): 47 advancement reports + 27 advancement features in
TWH duplicate Scoutbook / Internet Advancement / My.Scouting. We
deep-link out, we do not rebuild. **But** parents and leaders
constantly ask "where is my Scout's rank progress?" inside Compass
because the workflow lives there. A read-only mirror solves that
without us getting on Scouting America's wrong side.

## Goals

1. Surface read-only Scoutbook data — rank, MB progress, awards,
   service hours — on existing Compass surfaces:
   - Member detail page (`/admin/members/[id]`)
   - Parent My Scouts portal (already shipped — empty advancement card)
   - Eagle tracker (`/admin/eagle`)
2. Stay current via **periodic pull**, not a write path. We never
   POST to Scoutbook.
3. Be obviously not-the-source-of-truth in the UI. Every Scoutbook
   field has a "Source: Scoutbook · last synced X" footer and a
   deep-link to the Scoutbook record.
4. Survive Scoutbook outages and rate limits gracefully.

## Non-goals

- We never write to Scoutbook.
- We never proxy Scoutbook authentication (a parent signing into
  Compass is not signing into Scoutbook).
- Council Advancement Report stays an export from Scoutbook.
- We do not emulate Scoutbook UI; advancement lives at Scoutbook.

## Three credible integration paths

We don't pick one today; we design the schema + sync layer so any of
them can plug in.

### Path A — Official Scoutbook API (when it exists)

Scouting America has historically gestured at an API. If/when they
publish one with OAuth and unit-scoped read scope, we do this:

- Per-org OAuth: leader connects the unit to an SA app at
  `/admin/scoutbook/connect`.
- Stored: refresh token (encrypted with the org DEK), unit number,
  council number.
- Hourly cron pulls roster + advancement diffs.
- Webhook subscription if SA offers one; otherwise polling with
  `If-Modified-Since`.

This is the preferred path. Everything below is the same once data
lands in our local cache.

### Path B — Authorized scrape on the leader's behalf

Some platforms (TWH historically) have offered a "paste your
Scoutbook session cookie" flow. Compass refuses this — there's no way
to make a session-cookie scrape secure (the platform now has long-
lived credentials with full write authority on the scout's behalf).
We will not implement this even if asked. It's a security and
reputational footgun.

### Path C — Internet Advancement CSV import

A leader pulls **Council Advancement Export** (CSV) from Internet
Advancement / My.Scouting and uploads it to
`/admin/scoutbook/import`. We parse, diff against our cache, and
update.

This is the realistic v0. It's manual, the leader controls the
cadence (typically weekly), and there's no credential storage. It
covers 80% of the perceived value (rank + most-recent MB progress).

We start with Path C. Path A retro-fits the same data model.

## Schema

```prisma
model ScoutbookConnection {
  id           String   @id @default(cuid())
  orgId        String   @unique
  // Path A only — null while we're on Path C.
  refreshTokenCt Bytes?  // encrypted with org DEK
  unitNumber   String?
  councilNumber String?
  // Common fields
  lastSyncedAt DateTime?
  lastSyncStatus String? // "ok" | "partial" | "error:rate-limit" | ...
  lastSyncError  String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  org          Org      @relation(fields: [orgId], references: [id], onDelete: Cascade)
}

model ScoutbookProfile {
  id             String  @id @default(cuid())
  orgId          String
  memberId       String  @unique
  // Scoutbook user id (already on Member as scoutbookUserId, but we
  // also keep it here for the cache index).
  scoutbookUserId String
  rank           String?  // "Scout" | "Tenderfoot" | ... | "Eagle"
  rankAchievedAt DateTime?
  serviceHours   Float    @default(0)
  campingNights  Int      @default(0)
  hikingMiles    Float    @default(0)
  // Free-form JSON for fields we don't yet model — keep the upgrade
  // path easy.
  extras         Json     @default("{}")
  syncedAt       DateTime
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  org    Org    @relation(fields: [orgId], references: [id], onDelete: Cascade)
  member Member @relation(fields: [memberId], references: [id], onDelete: Cascade)

  meritBadges  ScoutbookMeritBadge[]
  awards       ScoutbookAward[]

  @@index([orgId, syncedAt])
}

model ScoutbookMeritBadge {
  id          String  @id @default(cuid())
  profileId   String
  badgeName   String
  // "in-progress" | "completed" | "approved"
  status      String
  startedAt   DateTime?
  completedAt DateTime?
  // For councils that report counselor IDs, we store but do not link.
  counselorRef String?

  profile ScoutbookProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)

  @@unique([profileId, badgeName])
  @@index([profileId, status])
}

model ScoutbookAward {
  id          String  @id @default(cuid())
  profileId   String
  awardName   String
  awardedAt   DateTime?

  profile ScoutbookProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)
}

model ScoutbookSyncRun {
  id           String   @id @default(cuid())
  orgId        String
  startedAt    DateTime @default(now())
  finishedAt   DateTime?
  source       String   // "csv" | "api"
  rowsSeen     Int      @default(0)
  rowsApplied  Int      @default(0)
  warnings     String[] @default([])
  errorMessage String?

  org Org @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@index([orgId, startedAt])
}
```

## Sync layer

A small `src/lib/scoutbook/` module:

- `csvImport.ts` — parses Internet Advancement CSV, calls
  `applyAdvancement()` row by row.
- `applyAdvancement.ts` — pure function: given (orgId, scoutbookUserId,
  parsed-row), update or create the cache rows. Idempotent.
- `match.ts` — resolve scoutbookUserId → Member. Most rosters set
  `Member.scoutbookUserId` manually; for unmatched rows we surface a
  per-row picker on the import page.
- `apiClient.ts` — Path A. Stub for now.
- `cron.ts` — pg-boss queue handler. Path A only.

CSV import workflow:

1. Leader uploads CSV at `/admin/scoutbook/import`.
2. We parse, dedupe by `scoutbookUserId`, present the diff:
   - Matched rows: "Tom Smith — Star → Life on 2026-04-12 (was: Star)"
   - Unmatched rows: pickers to manually link Members.
3. Leader confirms. We write a `ScoutbookSyncRun` row + apply
   advancement updates inside one transaction.

API workflow (Path A, when it lands):

1. pg-boss `scoutbook-sync` queue, scheduled hourly per connected
   org.
2. Pull profile changes since `lastSyncedAt`.
3. Apply via the same `applyAdvancement` path the CSV import uses.
4. On rate-limit responses, back off and surface a "syncing slowly"
   chip on the admin page.

## Surfaces

- `/admin/members/[id]` adds a "Scoutbook" panel: rank + recent
  MBs + service hours, with an `Open in Scoutbook` deep link.
- `/account/my-scouts` flips the "advancement when Scoutbook syncs"
  placeholder into actual data + deep link.
- `/admin/eagle` already exists; its read path becomes
  "ScoutbookProfile rank where rank == 'Eagle'" instead of the
  manual data we keep today.
- `/admin/scoutbook` — connection status + last-sync footer +
  "import CSV" button.

Every Scoutbook-sourced field is rendered with a footer:

> Source: Scoutbook · Synced 14 minutes ago · [Open in Scoutbook ↗]

## Privacy & security

- The cache is **derived data**. We don't store anything that isn't
  already on a leader's Internet Advancement export.
- Refresh tokens (Path A) encrypted with the org DEK at rest. No
  global vault key.
- A delete on `Member` cascades to `ScoutbookProfile`.
- Sync logs go to the audit log we just shipped (`entityType:
  "ScoutbookSync"`).
- The "Open in Scoutbook" links go to scoutbook.scouting.org;
  parents click them when signed into Scoutbook in the same
  browser. We don't proxy.

## Phasing

**Phase 0 — schema + CSV importer**:
- Schema migration
- CSV parser + diff UI + import page
- Member-detail Scoutbook panel
- Audit log integration

**Phase 1 — parent visibility**:
- Wire ScoutbookProfile into the My Scouts portal
- Eagle tracker reads from cache instead of manual data

**Phase 2 — API client (when API exists)**:
- OAuth connect flow
- pg-boss hourly cron
- Same `applyAdvancement` path

## Open questions

1. **CSV format stability.** Internet Advancement's export changes
   periodically. We log unknown columns to `warnings[]` rather
   than failing imports.
2. **Awards taxonomy.** Long tail (Cyber Chip, religious knots, NESA
   awards). Cache them as free-form `ScoutbookAward.awardName` and
   improve the rendering only when a real consumer needs it.
3. **Family linkage.** Scoutbook tracks parents too. We probably
   don't need that data in v1; `Member.parentIds` already drives our
   parent flows.
4. **Manual override.** A leader who wants to record a rank
   off-cycle (e.g. between Scoutbook syncs) can still bump our
   manual fields — we surface a "manual override" pill when our
   cache disagrees with the manual value, so it's obvious which one
   the source-of-truth view should believe.
