# Publish-to-static architecture

> Status: design + prototype.
> Goal: Public unit-site pages stay up when the database has a blip,
> and admin "Save" produces a stable rendered output that's served
> directly without re-rendering on every request.

## What lives where

| Surface | Today | Target |
|---|---|---|
| `/o/[slug]/` (homepage) | SSR on every hit, queries 4 tables in parallel | Render once on publish → cache as static HTML; widgets hydrate from API |
| `/o/[slug]/calendar` | SSR | Static shell + `<UpcomingEventsWidget>` from `/api/public/orgs/[slug]/upcoming-events` |
| `/o/[slug]/photos` | SSR | Static shell + `<RecentPhotosWidget>` |
| `/o/[slug]/posts` | SSR | Static shell + `<AnnouncementsWidget>` |
| `/o/[slug]/p/[pageSlug]` | SSR | Static shell from `Page.body` markdown |
| `/o/[slug]/admin/**` | SSR | Stays SSR — admin needs live data, no DB-down expectation |
| Marketing site | SSR | Stays SSR (out of scope for this pass) |

## Failure modes the design protects against

1. **DB blip during a public-page render** → previously published HTML
   still serves because it's read from disk, not from Postgres.
2. **Slow query during peak traffic** → the static shell is bytes from
   disk; widgets fail open with a "loading..." state.
3. **Schema drift between deploys** → old published HTML keeps serving
   until the admin re-publishes against the new schema.

## Components

### 1. Publish step

`publishOrgHome(orgId)` server action lives in
`src/server-actions/publish.ts`. Triggered:
- Manually via the admin "Publish" button on `/admin/site`.
- Implicitly when an admin saves a hero / page block (debounced).

Steps:
1. Read `Org` + `Page` from Prisma.
2. Render the homepage's static shell with React's
   `renderToStaticMarkup`. Widgets render their *placeholder* state
   only — no DB queries baked into the HTML.
3. Wrap the markup in the document chrome (`<html>`, `<head>` with
   `<link>` tags for the existing Tailwind bundle, `<script>` tag for
   the hydration entry).
4. Write to disk:
   `${LOCAL_UPLOADS_DIR ?? "/data"}/published/${orgSlug}/home.html`.
5. Stamp `Page.publishedAt` so the admin UI can show "Published 5 minutes ago".

### 2. Static-serve route

A new route handler `src/app/(static)/orgs/[slug]/home/route.ts`
returns the on-disk HTML with `Cache-Control: public, max-age=60,
stale-while-revalidate=3600`. Returns 404 if the org has never been
published (the existing SSR page is the fallback).

### 3. Public read-only API

| Endpoint | Returns |
|---|---|
| `GET /api/public/orgs/[slug]/upcoming-events` | next 10 events |
| `GET /api/public/orgs/[slug]/recent-photos` | last 12 public photos |
| `GET /api/public/orgs/[slug]/announcements` | last 5 announcements |

Public — no bearer required. Returns only fields safe for the public
surface (no PII, no member-only visibility). Each endpoint is wrapped
in a 30s in-memory cache to absorb traffic bursts.

### 4. Client-side widgets

Small client components in `src/components/widgets/`:
- `<UpcomingEventsWidget orgSlug>`
- `<RecentPhotosWidget orgSlug>`
- `<AnnouncementsWidget orgSlug>`

Each fetches from the corresponding public API on mount, renders a
loading state for ~200ms, swaps to the data, and shows a graceful
"couldn't load" line on fetch error. The published HTML embeds them
as `<div data-compass-widget="upcoming-events" data-org="troop100">`
and a tiny inline `<script>` boots them.

### 5. Middleware fallback

If SSR throws on a public page (DB unreachable), middleware checks
for `${LOCAL_UPLOADS_DIR}/published/${slug}/home.html` and serves it
as a 200 instead of the 500. This covers the cold-cache case where
ISR can't refresh.

## Out of scope for this pass

- Marketing-site-from-designer (deferred)
- Custom-page builder publish (homepage prototype first; pages/p/* gets the same treatment afterwards)
- CDN / S3 storage for published HTML (`STORAGE_DRIVER=s3` would write there too)
- Edge runtime for the static-serve route (Node is fine, content is on disk)

## Migration plan

1. **Phase 1 (this PR)** — Add public APIs, widgets, ISR + on-disk
   fallback for the homepage only. `/admin/site` gets a Publish button.
2. **Phase 2** — Same treatment for `/calendar`, `/photos`, `/posts`,
   `/p/[pageSlug]`.
3. **Phase 3** — Cache invalidation tags so admin saves implicitly
   re-publish.
4. **Phase 4** — Optional: write to S3 when configured, add a static
   CDN in front.
