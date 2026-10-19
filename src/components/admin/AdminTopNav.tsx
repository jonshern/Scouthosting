// Admin header (Modern Clean, Admin board). Top row: the mark and unit
// name, the settings links (Setup, Site, Pages, Security, Domain,
// Billing), View site and the account avatar. Second row: the seven
// sections as tabs, with an ink underline on the current one. On narrow
// screens the settings links move to the end of the tab row, which
// scrolls sideways.
//
// Each section's deep links (e.g. /admin/members/import) are picked up
// by the sub-nav rendered inside each page when needed; the top nav
// only highlights the section, not the leaf.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mark } from "@/components/ui/Mark";

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
        `${o}/admin/locations`,
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
        `${o}/admin/reports`,
        `${o}/admin/permission-slips`,
        `${o}/admin/equipment`,
        `${o}/admin/audit`,
        `${o}/admin/scoutbook`,
        `${o}/admin/patrols`,
        `${o}/admin/pending`,
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
      href: `${o}/admin/treasury`,
      label: "Money",
      match: [
        `${o}/admin/treasury`,
        `${o}/admin/refunds`,
        `${o}/admin/reimbursements`,
        `${o}/admin/sales`,
      ],
    },
  ];
}

function buildSecondary(slug: string): NavItem[] {
  const o = `/o/${slug}`;
  return [
    { href: `${o}/admin/setup`, label: "Setup" },
    { href: `${o}/admin/site`, label: "Site" },
    { href: `${o}/admin/pages`, label: "Pages" },
    { href: `${o}/admin/security`, label: "Security" },
    { href: `${o}/admin/domain`, label: "Domain" },
    { href: `${o}/admin/billing`, label: "Billing" },
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
  // The unit's own host shows /admin; the apex shows /o/<slug>/admin.
  const raw = usePathname() ?? "";
  const pathname = raw.startsWith("/o/") ? raw : `/o/${slug}${raw}`;
  const primary = buildPrimary(slug);
  const secondary = buildSecondary(slug);
  const overviewHref = `/o/${slug}/admin`;
  // Treat /admin (exactly) as Overview, so deeper routes don't double-light it.
  const primaryWithExactOverview = primary.map((it) =>
    it.href === overviewHref ? { ...it, match: [overviewHref] } : it,
  );
  const settingsLink = (it: NavItem) => {
    const active = isActive(pathname, it);
    return (
      <Link
        key={it.href}
        href={it.href}
        aria-current={active ? "page" : undefined}
        className={
          "whitespace-nowrap rounded-lg px-2.5 py-1.5 no-underline transition-colors " +
          (active ? "bg-sunk text-ink hover:text-ink" : "text-muted hover:bg-sunk hover:text-ink")
        }
      >
        {it.label}
      </Link>
    );
  };
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex min-h-[60px] max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:px-8">
        <Link
          href={`/o/${slug}/admin`}
          className="flex items-center gap-2.5 text-[15px] font-semibold text-ink no-underline hover:text-ink"
        >
          <Mark size={32} />
          <span>{unitLabel}</span>
        </Link>
        <div className="ml-auto flex items-center gap-3">
          <nav aria-label="Settings" className="hidden items-center gap-0.5 text-[13px] font-medium lg:flex">
            {secondary.map(settingsLink)}
          </nav>
          <Link
            href={`/o/${slug}`}
            className="whitespace-nowrap text-sm font-medium text-ink-2 no-underline hover:text-ink"
          >
            View site
          </Link>
          <Link
            href="/account"
            aria-label="Account"
            className="grid h-[34px] w-[34px] place-items-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent-soft-text no-underline hover:text-accent-soft-text"
          >
            {initials}
          </Link>
        </div>
      </div>
      <div className="mx-auto flex max-w-[1400px] items-center gap-4 overflow-x-auto px-4 sm:px-8">
        <nav aria-label="Admin sections" className="flex items-center gap-1 text-sm font-medium">
          {primaryWithExactOverview.map((it) => {
            const active = isActive(pathname, it);
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={
                  "whitespace-nowrap px-3 py-3 no-underline transition-colors " +
                  (active
                    ? "text-ink shadow-[inset_0_-2px_0_var(--ink)] hover:text-ink"
                    : "text-muted hover:text-ink")
                }
              >
                {it.label}
              </Link>
            );
          })}
        </nav>
        <nav
          aria-label="Settings (more)"
          className="flex items-center gap-0.5 border-l border-line pl-3 text-[13px] font-medium lg:hidden"
        >
          {secondary.map(settingsLink)}
        </nav>
      </div>
    </header>
  );
}
