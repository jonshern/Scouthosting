// Admin top-nav. Matches the AdminBalanced layout from
// design_handoff_compass/designs/admin-pages.jsx — 7 primary section
// links across the top, ink border-bottom 1.5px, sky-blue underline
// for the active section. We keep a small Settings link on the right
// for the operator-only screens (site, pages, security, domain) that
// don't fit cleanly under the marketing nav.
//
// Each section's deep links (e.g. /admin/members/import) are picked up
// by the sub-nav rendered inside each page when needed; the top nav
// only highlights the section, not the leaf.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  /** Path prefixes that should also light this nav item. */
  match?: string[];
};

function buildPrimary(slug: string): NavItem[] {
  const o = `/o/${slug}`;
  return [
    { href: `${o}/admin`, label: "Overview", match: [`${o}/admin`] },
    {
      href: `${o}/admin/events`,
      label: "Calendar",
      match: [
        `${o}/admin/events`,
        `${o}/admin/trips`,
        `${o}/admin/coh`,
        `${o}/admin/car-rides`,
      ],
    },
    {
      href: `${o}/admin/members`,
      label: "Roster",
      match: [
        `${o}/admin/members`,
        `${o}/admin/training`,
        `${o}/admin/eagle`,
        `${o}/admin/oa`,
        `${o}/admin/merit-badge-counselors`,
      ],
    },
    {
      href: `${o}/admin/announcements`,
      label: "Messages",
      match: [
        `${o}/admin/announcements`,
        `${o}/admin/posts`,
        `${o}/admin/email`,
        `${o}/admin/channels`,
        `${o}/admin/dm`,
        `${o}/admin/newsletters`,
      ],
    },
    { href: `${o}/admin/photos`, label: "Photos", match: [`${o}/admin/photos`] },
    {
      href: `${o}/admin/forms`,
      label: "Forms",
      match: [`${o}/admin/forms`, `${o}/admin/surveys`],
    },
    {
      href: `${o}/admin/refunds`,
      label: "Money",
      match: [`${o}/admin/refunds`, `${o}/admin/reimbursements`],
    },
  ];
}

function buildSecondary(slug: string): NavItem[] {
  const o = `/o/${slug}`;
  return [
    { href: `${o}/admin/site`, label: "Site" },
    { href: `${o}/admin/pages`, label: "Pages" },
    { href: `${o}/admin/security`, label: "Security" },
    { href: `${o}/admin/domain`, label: "Domain" },
  ];
}

function isActive(pathname: string, item: NavItem): boolean {
  const matches = item.match ?? [item.href];
  // Order longest-first so /admin/members/import lights Roster (not
  // Overview) — startsWith on /admin alone would match everything.
  return matches.some((m) =>
    pathname === m || pathname.startsWith(`${m}/`),
  );
}

export function AdminTopNav({
  slug,
  initials,
  unitLabel,
}: {
  slug: string;
  initials: string;
  unitLabel: string;
}) {
  const pathname = usePathname() ?? "";
  const primary = buildPrimary(slug);
  const secondary = buildSecondary(slug);
  const overviewHref = `/o/${slug}/admin`;
  // Treat /admin (exactly) as Overview, so deeper routes don't double-light it.
  const primaryWithExactOverview = primary.map((it) =>
    it.href === overviewHref ? { ...it, match: [overviewHref] } : it,
  );
  return (
    <div className="border-b border-slate-ink/90 bg-white">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between px-8 py-3.5">
        <div className="flex items-center gap-8">
          <Link
            href={`/o/${slug}`}
            className="font-display text-base font-medium tracking-tight text-slate-ink"
          >
            Compass
          </Link>
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-muted">
            {unitLabel}
          </span>
          <nav aria-label="Admin sections" className="flex items-center gap-5 text-sm">
            {primaryWithExactOverview.map((it) => {
              const active = isActive(pathname, it);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={
                    "pb-1 transition-colors " +
                    (active
                      ? "border-b-2 border-sky font-semibold text-slate-ink"
                      : "border-b-2 border-transparent text-slate-soft hover:text-slate-ink")
                  }
                >
                  {it.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-slate-soft">
          <nav aria-label="Settings" className="flex items-center gap-3 text-xs">
            {secondary.map((it) => {
              const active = isActive(pathname, it);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={
                    "transition-colors " +
                    (active ? "font-semibold text-slate-ink" : "hover:text-slate-ink")
                  }
                >
                  {it.label}
                </Link>
              );
            })}
          </nav>
          <Link
            href="/account"
            aria-label="Account"
            className="grid h-8 w-8 place-items-center rounded-full bg-sky text-[11px] font-semibold text-white"
          >
            {initials}
          </Link>
        </div>
      </div>
    </div>
  );
}
