// Public tenant home — ported from
// design_handoff_compass/designs/troop-pages.jsx (Balanced treatment).
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

// Render the homepage as ISR — Next caches the response for 60s and
// background-revalidates. With the widgets fetching live data
// client-side, this means the rendered HTML can sit in the cache for
// minutes without going stale.
export const revalidate = 60;

function PhotoTile({
  filename,
  tone,
  alt,
}: {
  filename?: string | null;
  tone: string;
  alt: string;
}) {
  if (filename) {
    /* eslint-disable-next-line @next/next/no-img-element */
    return (
      <img src={`/uploads/${filename}`} alt={alt} className="h-full w-full object-cover" />
    );
  }
  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ background: `linear-gradient(135deg, ${tone}, ${tone}aa 60%, #0f172a)` }}
    >
      <svg
        viewBox="0 0 100 75"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full opacity-30"
      >
        <polygon points="0,55 30,32 60,48 100,38 100,75 0,75" fill="#0f172a" />
      </svg>
    </div>
  );
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
      {/* Hero — split: dark slate left + photo right */}
      <section className="grid min-h-[420px] border-b border-line md:min-h-[560px] md:grid-cols-2">
        <div className="relative flex flex-col justify-center overflow-hidden bg-surface-dark px-6 py-14 text-white md:px-12">
          {unitNumber && (
            <span
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-10 select-none font-display text-[220px] italic leading-none text-sky md:text-[360px]"
              style={{ opacity: 0.12 }}
            >
              {unitNumber}
            </span>
          )}
          <span className="relative mb-6 inline-flex items-center gap-2 self-start rounded-full bg-sky px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white">
            {org.unitType} · {org.council ?? "Independent"} Council
          </span>
          <h1 className="relative font-display text-[64px] font-normal leading-[0.88] tracking-[-0.035em] md:text-[96px] lg:text-[120px]">
            {page?.heroHeadline ? (
              page.heroHeadline
            ) : (
              <>
                {org.unitType}
                <br />
                <em className="font-normal not-italic text-sky md:italic">
                  {unitNumber || org.displayName}.
                </em>
              </>
            )}
          </h1>
          {heroLede && (
            <div
              className="relative mt-7 max-w-[460px] text-base leading-[1.6] text-white/75"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: renderMarkdownLite(heroLede) }}
            />
          )}
        </div>
        <div className="relative min-h-[260px] overflow-hidden">
          <PhotoTile
            filename={heroPhoto?.filename}
            tone="#1d4ed8"
            alt={heroPhoto?.caption || `${org.displayName} hero`}
          />
          {heroPhoto?.caption && (
            <span className="absolute bottom-4 left-4 bg-ink px-2.5 py-1 text-[10px] uppercase tracking-[0.08em] text-white">
              {heroPhoto.caption}
            </span>
          )}
        </div>
      </section>

      {/* Main two-column */}
      <div className="mx-auto grid max-w-content gap-10 px-6 py-14 md:grid-cols-[1.5fr_0.85fr]">
        <div>
          {/* About + stats */}
          <section className="mb-12">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-sky">
              About our {org.unitType.toLowerCase()}
            </div>
            <h2 className="mb-4 font-display text-[28px] font-normal leading-[1.15] md:text-[36px]">
              {org.tagline ?? `Scout-led, community-rooted${
                org.founded ? `, since ${org.founded}` : "."
              }`}
            </h2>
            <p className="text-[15px] leading-[1.7] text-slate-soft">
              {[org.charterOrg, org.city && `${org.city}, ${org.state}`]
                .filter(Boolean)
                .join(" · ")}
              . We meet {org.meetingDay} at {org.meetingTime}
              {org.meetingLocation ? ` at ${org.meetingLocation}` : ""}.
            </p>
            <div className="mt-7 grid grid-cols-2 gap-4 rounded-lg border border-line-soft bg-white p-5 md:grid-cols-4">
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
                <div key={s.l}>
                  <div className="font-display text-[24px] font-medium leading-none text-ink md:text-[28px]">
                    {s.n}
                  </div>
                  <div className="mt-1 text-xs text-slate-soft">{s.l}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Recent photos — fetched client-side */}
          <section className="mb-12">
            <div className="mb-4 flex items-baseline justify-between">
              <h3 className="font-display text-[22px] font-normal md:text-[26px]">
                Recent adventures
              </h3>
              <Link href={`${base}/photos`} className="text-xs font-medium text-sky">
                View all photos →
              </Link>
            </div>
            <RecentPhotosWidget orgSlug={slug} count={6} />
          </section>

          {/* News / announcements — fetched client-side */}
          <section>
            <div className="mb-4 flex items-baseline justify-between">
              <h3 className="font-display text-[22px] font-normal md:text-[26px]">
                News & announcements
              </h3>
              <Link href={`${base}/posts`} className="text-xs font-medium text-sky">
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
                        <h2 className="font-display text-2xl font-medium">{b.title}</h2>
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
                        <h2 className="font-display text-2xl font-medium">{b.title}</h2>
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
          <div className="sticky top-6 rounded-xl border border-line bg-white p-6">
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
              <h3 className="font-display text-[20px] font-medium md:text-[22px]">
                Upcoming events
              </h3>
            </div>
            <UpcomingEventsWidget orgSlug={slug} />
            <Link
              href={`${base}/calendar`}
              className="mt-5 block w-full rounded-md bg-ink py-2.5 text-center text-[13px] font-medium text-white transition-colors hover:bg-sky"
            >
              Full calendar →
            </Link>
          </div>

          {org.charterOrg && (
            <div className="mt-4 rounded-xl border border-line bg-surface-alt p-5">
              <div className="mb-2 text-xs uppercase tracking-[0.06em] text-slate-muted">
                Sponsored by
              </div>
              <div className="font-display text-[18px]">{org.charterOrg}</div>
              {(org.city || org.state) && (
                <div className="mt-2 text-xs leading-[1.5] text-slate-soft">
                  {[org.city, org.state].filter(Boolean).join(", ")}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      <footer className="border-t border-line bg-surface-alt text-[11px] text-slate-muted">
        <div className="mx-auto flex max-w-content justify-between px-6 py-5">
          <span>
            © {now.getFullYear()} {org.displayName} · Hosted with Compass
          </span>
          <span>Privacy · Terms</span>
        </div>
      </footer>
    </main>
  );
}
