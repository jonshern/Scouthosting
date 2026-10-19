// Side nav for /account (a row of tabs on a phone). Hidden on the pages
// that are a step in sign-up or sign-in (make a passkey, confirm you're
// an adult) and after an account is deleted, so those stay one thing to do.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const ITEMS = [
  { href: "/account/profile", label: "Profile" },
  { href: "/account/security", label: "Sign-in and security" },
  { href: "/account/password", label: "Password" },
  { href: "/account/my-scouts", label: "My scouts" },
  { href: "/account/my-stuff", label: "My stuff" },
  { href: "/account/trails", label: "Lantern trails" },
  { href: "/account/api-tokens", label: "Apps and Claude" },
];

const STEP_PAGES = ["/account/passkey", "/account/confirm-adult", "/account/delete/done"];

export function AccountNav() {
  const pathname = usePathname() ?? "";
  const navRef = useRef<HTMLElement>(null);
  // On a phone the tabs scroll sideways; keep the current one in view.
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);
  if (STEP_PAGES.some((p) => pathname.startsWith(p))) return null;
  const link = (href: string, current: boolean, danger = false) =>
    `block whitespace-nowrap rounded-md px-3 py-2 text-sm no-underline transition-colors ${
      current
        ? "bg-accent-soft font-medium text-accent-soft-text"
        : danger
          ? "text-danger hover:bg-danger-soft hover:text-danger"
          : "text-ink-2 hover:bg-sunk hover:text-ink"
    }`;
  return (
    <nav ref={navRef} aria-label="Account" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0">
      <ul className="flex gap-1 md:flex-col">
        {ITEMS.map((i) => {
          const current = pathname === i.href;
          return (
            <li key={i.href}>
              <Link href={i.href} aria-current={current ? "page" : undefined} className={link(i.href, current)}>
                {i.label}
              </Link>
            </li>
          );
        })}
        <li className="md:mt-4 md:border-t md:border-line md:pt-4">
          <Link
            href="/account/delete"
            aria-current={pathname === "/account/delete" ? "page" : undefined}
            className={link("/account/delete", pathname === "/account/delete", true)}
          >
            Delete account
          </Link>
        </li>
      </ul>
    </nav>
  );
}
