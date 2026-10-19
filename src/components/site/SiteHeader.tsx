// Public unit-site header (Modern Clean, troop site home board): the
// mark and unit name on the left, page links as quiet pills with the
// current page filled, and Admin as an outlined button. Admin pages have
// their own header (AdminTopNav), so this one steps aside there.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mark } from "@/components/ui/Mark";

export function SiteHeader({
  base,
  name,
  place,
  customPages,
}: {
  /** "" on the unit's own host, "/o/<slug>" on the apex. */
  base: string;
  name: string;
  /** "Charter org · City, ST", when the unit has filled them in. */
  place: string | null;
  customPages: Array<{ slug: string; title: string }>;
}) {
  // The path without the apex's /o/<slug> prefix, which the unit's own
  // host doesn't show but a rewrite can leave in place.
  const path = (usePathname() ?? "").replace(/^\/o\/[^/]+/, "") || "/";
  if (/^\/admin(\/|$)/.test(path)) return null;
  const admin = `${base}/admin`;

  const home = base || "/";
  const links = [
    { href: `${base}/calendar`, label: "Calendar" },
    { href: `${base}/photos`, label: "Photos" },
    { href: `${base}/posts`, label: "Posts" },
    ...customPages.map((p) => ({ href: `${base}/p/${p.slug}`, label: p.title })),
  ];
  const current = (href: string) => {
    const h = href.slice(base.length);
    return path === h || path.startsWith(`${h}/`);
  };

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex min-h-[68px] max-w-content flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-3">
        <Link href={home} className="flex items-center gap-3 text-ink no-underline hover:text-ink">
          <Mark size={36} />
          <span className="flex flex-col leading-tight">
            <span className="text-base font-semibold tracking-[-0.01em]">{name}</span>
            {place ? <span className="text-xs text-muted">{place}</span> : null}
          </span>
        </Link>
        <nav aria-label="Site" className="flex flex-wrap items-center gap-1 text-sm font-medium">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={current(l.href) ? "page" : undefined}
              className={
                "rounded-lg px-3 py-2 no-underline transition-colors " +
                (current(l.href)
                  ? "bg-sunk text-ink hover:text-ink"
                  : "text-ink-2 hover:bg-sunk hover:text-ink")
              }
            >
              {l.label}
            </Link>
          ))}
          <Link
            href={admin}
            className="ml-2 rounded-lg border border-control bg-surface px-4 py-2 text-ink no-underline transition-colors hover:bg-sunk hover:text-ink"
          >
            Admin
          </Link>
        </nav>
      </div>
    </header>
  );
}
