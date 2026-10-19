// Public tenant home, in the suite's Modern Clean look (troop site home
// board).
//
// Architecture (see docs/publish-architecture.md):
// 1. Static content (hero, page-builder blocks, sponsor card, meeting
//    info) is rendered server-side from the cached `Org` + `Page`
//    records. The cache is tagged so admin saves invalidate it.
// 2. Live content (upcoming events, recent photos, announcements) is
//    fetched client-side from /api/public/orgs/<slug>/* — meaning a
//    DB blip won't 500 the homepage; widgets just render their
//    "couldn't load" state and the page keeps serving.
// 3. ISR (`revalidate = 60`) caches the rendered shell so most hits
//    don't touch the DB at all.

import Link from "next/link";
import { notFound } from "next/navigation";
import { renderMarkdownLite } from "@/lib/markdown";
import { readCustomBlocks } from "@/lib/homepage/sections";
import { UpcomingEventsWidget } from "@/components/widgets/UpcomingEventsWidget";
import { RecentPhotosWidget } from "@/components/widgets/RecentPhotosWidget";
import { AnnouncementsWidget } from "@/components/widgets/AnnouncementsWidget";
import { loadHomeSnapshot } from "@/lib/publish/snapshot";
import { orgBasePath } from "@/lib/tenancy/base-path";
import { PhotoPlaceholder } from "@/components/ui/PhotoPlaceholder";

// Render the homepage as ISR — Next caches the response for 60s and
// background-revalidates. With the widgets fetching live data
// client-side, this means the rendered HTML can sit in the cache for
// minutes without going stale.
export const revalidate = 60;

function HeroPhoto({ filename, alt }: { filename?: string | null; alt: string }) {
  if (filename) {
    /* eslint-disable-next-line @next/next/no-img-element */
    return <img src={`/uploads/${filename}`} alt={alt} className="h-full w-full object-cover" />;
  }
  return <PhotoPlaceholder />;
}

export default async function OrgHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const base = await orgBasePath(slug);
  const shell = await loadHomeSnapshot(slug);
  if (!shell) notFound();
  const { org, page, memberCount, heroPhoto } = shell;

  const heroLede =
    page?.heroLede ??
    org.tagline ??
    `${org.charterOrg ?? ""} • ${org.city ?? ""}, ${org.state ?? ""}`;
  const blocks = readCustomBlocks(page);
  const unitNumber = org.unitNumber || "";
  const now = new Date();

  return (
    <main>
      {/* Hero: words on the left, the unit's photo on the right */}
      <section className="mx-auto grid max-w-content items-center gap-10 px-6 pb-10 pt-12 md:grid-cols-2 md:gap-12 md:pb-14 md:pt-[72px]">
        <div className="flex flex-col gap-6">
          <span className="inline-flex items-center gap-2 self-start rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] text-ink-2">
            <span aria-hidden className="h-2 w-2 rounded-full bg-done" />
            {org.unitType} · {org.council ?? "Independent"} Council
          </span>
          <h1 className="text-[48px] font-semibold leading-[1.02] tracking-[-0.035em] md:text-[60px]">
            {page?.heroHeadline ? (
              page.heroHeadline
            ) : (
              <>
                {org.unitType}{" "}
                <span className="text-muted">{unitNumber || org.displayName}.</span>
              </>
            )}
          </h1>
          {heroLede && (
            <div
              className="max-w-[520px] text-[19px] leading-[1.55] text-ink-2"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: renderMarkdownLite(heroLede) }}
            />
          )}
          <div className="flex flex-wrap gap-3">
            <Link href={`${base}/calendar`} className="btn-primary min-h-[48px] px-5 text-[15px]">
              See the calendar
            </Link>
          </div>
        </div>
        <div className="relative aspect-[5/4] overflow-hidden rounded-2xl border border-line">
          <HeroPhoto
            filename={heroPhoto?.filename}
            alt={heroPhoto?.caption || `${org.displayName} hero`}
          />
          {heroPhoto?.caption && (
            <span className="absolute bottom-4 left-4 rounded-lg bg-surface/90 px-2.5 py-1.5 text-xs text-ink-2">
              {heroPhoto.caption}
            </span>
          )}
        </div>
      </section>

      {/* Main two-column */}
      <div className="mx-auto grid max-w-content gap-10 px-6 pb-16 pt-6 md:grid-cols-[1.5fr_0.85fr]">
        <div>
          {/* About + stats */}
          <section className="mb-12">
            <div className="eyebrow mb-2">
              About our {org.unitType.toLowerCase()}
            </div>
            <h2 className="mb-4 text-[28px] font-semibold leading-[1.15] tracking-[-0.025em] md:text-[32px]">
              {org.tagline ?? `Scout-led, community-rooted${
                org.founded ? `, since ${org.founded}` : "."
              }`}
            </h2>
            <p className="text-[15px] leading-[1.7] text-ink-2">
              {[org.charterOrg, org.city && `${org.city}, ${org.state}`]
                .filter(Boolean)
                .join(" · ")}
              . We meet {org.meetingDay} at {org.meetingTime}
              {org.meetingLocation ? ` at ${org.meetingLocation}` : ""}.
            </p>
            <div className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
              {[
                { n: String(memberCount || "—"), l: "Members" },
                {
                  n: org.founded
                    ? String(now.getFullYear() - parseInt(org.founded, 10))
                    : "—",
                  l: "years active",
                },
                { n: org.meetingDay ?? "—", l: "Meeting day" },
                { n: org.meetingTime ?? "—", l: "Meeting time" },
              ].map((s) => (
                <div key={s.l} className="flex flex-col gap-1 bg-surface p-4">
                  <div className="text-[20px] font-semibold leading-tight text-ink">
                    {s.n}
                  </div>
                  <div className="text-[13px] text-muted">{s.l}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Recent photos — fetched client-side */}
          <section className="mb-12">
            <div className="mb-4 flex items-baseline justify-between">
              <h3 className="text-[24px] font-semibold tracking-[-0.02em] md:text-[28px]">
                Recent adventures
              </h3>
              <Link href={`${base}/photos`} className="text-sm font-medium no-underline">
                View all photos →
              </Link>
            </div>
            <RecentPhotosWidget orgSlug={slug} count={6} />
          </section>

          {/* News / announcements — fetched client-side */}
          <section>
            <div className="mb-4 flex items-baseline justify-between">
              <h3 className="text-[24px] font-semibold tracking-[-0.02em] md:text-[28px]">
                News & announcements
              </h3>
              <Link href={`${base}/posts`} className="text-sm font-medium no-underline">
                All posts →
              </Link>
            </div>
            <AnnouncementsWidget orgSlug={slug} />
          </section>

          {/* Page-builder custom blocks (text/image/cta) below the editorial fold */}
          {blocks.length > 0 && (
            <div className="mt-12 space-y-10 border-t border-line pt-12">
              {blocks.map((raw) => {
                const b = raw as Record<string, string> & { type: string };
                if (b.type === "text") {
                  return (
                    <section key={b.id}>
                      {b.title && (
                        <h2 className="font-display text-2xl font-semibold">{b.title}</h2>
                      )}
                      {b.body && (
                        <div
                          className="prose prose-stone mt-2"
                          // eslint-disable-next-line react/no-danger
                          dangerouslySetInnerHTML={{ __html: renderMarkdownLite(b.body) }}
                        />
                      )}
                    </section>
                  );
                }
                if (b.type === "image") {
                  return (
                    <figure key={b.id}>
                      {b.filename && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={`/uploads/${b.filename}`}
                          alt={b.alt || ""}
                          className="w-full rounded-md"
                        />
                      )}
                      {b.caption && (
                        <figcaption className="mt-1 text-sm text-slate-muted">
                          {b.caption}
                        </figcaption>
                      )}
                    </figure>
                  );
                }
                if (b.type === "cta") {
                  return (
                    <section key={b.id} className="card">
                      {b.title && (
                        <h2 className="font-display text-2xl font-semibold">{b.title}</h2>
                      )}
                      {b.body && <p className="mt-2 text-slate-soft">{b.body}</p>}
                      {b.buttonLabel && b.buttonLink && (
                        <a href={b.buttonLink} className="btn-primary mt-3 inline-block">
                          {b.buttonLabel}
                        </a>
                      )}
                    </section>
                  );
                }
                return null;
              })}
            </div>
          )}
        </div>

        {/* Sidebar — Upcoming events (live) + sponsor (static) */}
        <aside>
          <div className="sticky top-6 rounded-xl border border-line bg-surface p-6">
            <div className="mb-4 flex items-center gap-2">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-ink"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <h3 className="text-[17px] font-semibold">
                Upcoming events
              </h3>
            </div>
            <UpcomingEventsWidget orgSlug={slug} />
            <Link
              href={`${base}/calendar`}
              className="btn-secondary mt-5 w-full no-underline"
            >
              Full calendar →
            </Link>
          </div>

          {org.charterOrg && (
            <div className="mt-4 rounded-xl border border-line bg-surface p-5">
              <div className="eyebrow mb-2">
                Sponsored by
              </div>
              <div className="text-[17px] font-semibold">{org.charterOrg}</div>
              {(org.city || org.state) && (
                <div className="mt-1 text-[13px] leading-[1.5] text-muted">
                  {[org.city, org.state].filter(Boolean).join(", ")}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      <footer className="border-t border-line bg-surface text-[13px] text-muted">
        <div className="mx-auto flex max-w-content flex-wrap justify-between gap-4 px-6 py-7">
          <span>
            © {now.getFullYear()} {org.displayName} · Hosted with Compass
          </span>
          <span>Privacy · Terms</span>
        </div>
      </footer>
    </main>
  );
}
