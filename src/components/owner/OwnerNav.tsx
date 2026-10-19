// Owner console sidebar (Modern Clean, operator boards): an ink column
// with the console's sections, the current one filled. On phones it sits
// above the page as a wrapped row.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/super-admin", label: "Overview" },
  { href: "/super-admin/orgs", label: "Units" },
  { href: "/super-admin/usage", label: "Usage" },
  { href: "/super-admin/people", label: "People" },
  { href: "/super-admin/billing", label: "Billing" },
  { href: "/super-admin/inbox", label: "Inbox" },
  { href: "/super-admin/signups", label: "Sign-ups" },
  { href: "/super-admin/errors", label: "Errors" },
  { href: "/super-admin/audit", label: "Audit log" },
  { href: "/super-admin/analytics", label: "Analytics" },
  { href: "/super-admin/architecture", label: "Architecture" },
];

export function OwnerNav() {
  const pathname = usePathname() ?? "";
  const current = (href: string) =>
    href === "/super-admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <nav aria-label="Owner console" className="flex flex-row flex-wrap gap-1 md:flex-col">
      {ITEMS.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          aria-current={current(it.href) ? "page" : undefined}
          className={
            "rounded-[9px] px-3 py-2.5 text-sm font-medium no-underline transition-colors " +
            (current(it.href)
              ? "bg-on-ink-raised text-white hover:text-white"
              : "text-on-ink-muted hover:bg-on-ink-raised hover:text-white")
          }
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
