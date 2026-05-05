// Public tenant home — ported from
// design_handoff_compass/designs/troop-pages.jsx (Balanced treatment).
// Slim header → split hero (dark slate + watermark numeral on the left,
// hero photo on the right) → two-column body with About + stats card +
// recent photos + announcements main, sticky upcoming-events sidebar.

import Link from "next/link";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { renderMarkdownLite } from "@/lib/markdown";
import { readCustomBlocks } from "@/lib/homepage/sections";

const SPECTRUM = ["#1d4ed8", "#0891b2", "#f59e0b", "#475569", "#bcd0f4", "#0f172a"];

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
  // Gradient stand-in for orgs without uploaded photos.
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
  const org = await prisma.org.findUnique({
    where: { slug },
    include: {
      announcements: { orderBy: { createdAt: "desc" }, take: 3 },
      page: true,
    },
  });
  if (!org) notFound();

  const now = new Date();
  const [events, recentPhotos, memberCount, eaglesThisYear] = await Promise.all([
    prisma.event.findMany({
      where: { orgId: org.id, startsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      take: 6,
    }),
    prisma.photo.findMany({
      where: {
        album: { orgId: org.id, visibility: "public" },
      },
      orderBy: { takenAt: "desc" },
      take: 6,
      select: { id: true, filename: true, caption: true },
    }).catch(() => [] as Array<{ id: string; filename: string; caption: string | null }>),
    prisma.member.count({ where: { orgId: org.id, deletedAt: null } }),
    Promise.resolve(0), // placeholder until we wire Eagle counts to a column
  ]);

  const heroLede =
    org.page?.heroLede ??
    org.tagline ??
    `${org.charterOrg} • ${org.city}, ${org.state}`;
  const blocks = readCustomBlocks(org.page);
  const unitNumber = org.unitNumber || "";

  return (
    <main>
      {/* The tenant layout already renders a header with the Calendar /
          Photos / Posts nav. We drop straight into the editorial hero. */}

      {/* Hero — split: dark slate left + photo right */}
      <section className="grid md:grid-cols-2 border-b border-line min-h-[420px] md:min-h-[560px]">
        <div className="relative bg-surface-dark text-white px-6 md:px-12 py-14 flex flex-col justify-center overflow-hidden">
          {/* Watermark unit number */}
          {unitNumber && (
            <span
              aria-hidden
              className="absolute -top-10 -right-10 font-display italic text-[220px] md:text-[360px] leading-none text-sky pointer-events-none select-none"
              style={{ opacity: 0.12 }}
            >
              {unitNumber}
            </span>
          )}
          <span className="relative inline-flex self-start items-center gap-2 px-3 py-1.5 rounded-full bg-sky text-white text-[11px] font-bold uppercase tracking-[0.14em] mb-6">
            {org.unitType} \u00B7 {org.council ?? "Independent"} Council
          </span>
          <h1 className="relative font-display text-[64px] md:text-[96px] lg:text-[120px] font-normal leading-[0.88] tracking-[-0.035em]">
            {org.page?.heroHeadline ? (
              org.page.heroHeadline
            ) : (
              <>
                {org.unitType}
                <br />
                <em className="text-sky font-normal not-italic md:italic">
                  {unitNumber || org.displayName}.
                </em>
              </>
            )}
          </h1>
          {heroLede && (
            <div
              className="relative mt-7 max-w-[460px] text-white/75 text-base leading-[1.6]"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: renderMarkdownLite(heroLede) }}
            />
          )}
        </div>
        <div className="relative overflow-hidden min-h-[260px]">
          <PhotoTile
            filename={recentPhotos[0]?.filename}
            tone="#1d4ed8"
            alt={recentPhotos[0]?.caption || `${org.displayName} hero`}
          />
          {recentPhotos[0]?.caption && (
            <span className="absolute bottom-4 left-4 px-2.5 py-1 bg-ink text-white text-[10px] uppercase tracking-[0.08em]">
              {recentPhotos[0].caption}
            </span>
          )}
        </div>
      </section>

      {/* Main two-column */}
      <div className="mx-auto max-w-content px-6 py-14 grid gap-10 md:grid-cols-[1.5fr_0.85fr]">
        <div>
          {/* About + stats */}
          <section className="mb-12">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky mb-2">
              About our {org.unitType.toLowerCase()}
            </div>
            <h2 className="font-display text-[28px] md:text-[36px] font-normal leading-[1.15] mb-4">
              {org.tagline ?? `Scout-led, community-rooted${
                org.founded ? `, since ${org.founded}` : "."
              }`}
            </h2>
            {/* No `about` column on Org yet — surface tagline + meeting info as the
                lede until we add a long-form description field. */}
            <p className="text-slate-soft text-[15px] leading-[1.7]">
              {[org.charterOrg, org.city && `${org.city}, ${org.state}`]
                .filter(Boolean)
                .join(" \u00B7 ")}
              . We meet {org.meetingDay} at {org.meetingTime}
              {org.meetingLocation ? ` at ${org.meetingLocation}` : ""}.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-7 p-5 bg-white border border-line-soft rounded-lg">
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
                  <div className="font-display text-[24px] md:text-[28px] font-medium text-ink leading-none">
                    {s.n}
                  </div>
                  <div className="text-xs text-slate-soft mt-1">{s.l}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Recent photos */}
          {recentPhotos.length > 0 && (
            <section className="mb-12">
              <div className="flex justify-between items-baseline mb-4">
                <h3 className="font-display text-[22px] md:text-[26px] font-normal">
                  Recent adventures
                </h3>
                <Link href="/photos" className="text-sky text-xs font-medium">
                  View all photos \u2192
                </Link>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {recentPhotos.slice(0, 6).map((p, i) => (
                  <div
                    key={p.id}
                    className="aspect-[4/3] rounded-md overflow-hidden bg-surface-alt"
                  >
                    <PhotoTile
                      filename={p.filename}
                      tone={SPECTRUM[i % SPECTRUM.length]}
                      alt={p.caption || "Recent photo"}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* News / announcements */}
          {org.announcements.length > 0 && (
            <section>
              <div className="flex justify-between items-baseline mb-4">
                <h3 className="font-display text-[22px] md:text-[26px] font-normal">
                  News & announcements
                </h3>
                <Link href="/posts" className="text-sky text-xs font-medium">
                  All posts \u2192
                </Link>
              </div>
              <div>
                {org.announcements.map((a) => (
                  <article key={a.id} className="py-5 border-t border-line">
                    <div className="text-[11px] text-slate-muted uppercase tracking-[0.04em] mb-1">
                      {new Date(a.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                    <h4 className="font-display text-[18px] md:text-[20px] font-medium mb-1.5">
                      {a.title}
                    </h4>
                    {a.body && (
                      <p className="text-[14px] text-slate-soft leading-[1.55] line-clamp-3">
                        {a.body}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}

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
                          className="mt-2 prose prose-stone"
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

        {/* Sidebar — Upcoming events + sponsor */}
        <aside>
          <div className="sticky top-6 bg-white border border-line rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
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
              <h3 className="font-display text-[20px] md:text-[22px] font-medium">
                Upcoming events
              </h3>
            </div>
            {events.length === 0 ? (
              <p className="text-slate-muted text-sm py-2">Nothing on the schedule yet.</p>
            ) : (
              <div>
                {events.map((e, i) => {
                  const d = new Date(e.startsAt);
                  return (
                    <div
                      key={e.id}
                      className={`flex gap-3.5 py-3.5 ${
                        i > 0 ? "border-t border-line-soft" : ""
                      }`}
                    >
                      <div className="w-12 shrink-0 text-center bg-surface-alt rounded-md py-1.5 h-12">
                        <div className="text-[9px] font-semibold tracking-[0.06em] text-ink uppercase">
                          {d.toLocaleString(undefined, { month: "short" })}
                        </div>
                        <div className="font-display text-[18px] font-medium leading-none">
                          {d.getDate()}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium truncate">{e.title}</div>
                        <div className="text-[11px] text-slate-soft">
                          {d.toLocaleString(undefined, { hour: "numeric", minute: "2-digit" })}
                          {e.location ? ` \u00B7 ${e.location}` : ""}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <Link
              href="/calendar"
              className="block w-full mt-5 text-center bg-ink text-white rounded-md py-2.5 text-[13px] font-medium hover:bg-sky transition-colors"
            >
              Full calendar \u2192
            </Link>
          </div>

          {org.charterOrg && (
            <div className="mt-4 bg-surface-alt border border-line rounded-xl p-5">
              <div className="text-xs uppercase tracking-[0.06em] text-slate-muted mb-2">
                Sponsored by
              </div>
              <div className="font-display text-[18px]">{org.charterOrg}</div>
              {(org.city || org.state) && (
                <div className="text-xs text-slate-soft leading-[1.5] mt-2">
                  {[org.city, org.state].filter(Boolean).join(", ")}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      <footer className="bg-surface-alt border-t border-line text-[11px] text-slate-muted">
        <div className="mx-auto max-w-content px-6 py-5 flex justify-between">
          <span>
            \u00A9 {now.getFullYear()} {org.displayName} \u00B7 Hosted with Compass
          </span>
          <span>Privacy \u00B7 Terms</span>
        </div>
      </footer>
    </main>
  );
}
