"use client";

// Closes the admin pages, except Billing and Security, once a unit's
// trial has ended or its subscription has lapsed (billingSummary's
// `locked`). The public site and members' pages stay up.

import Link from "next/link";
import { usePathname } from "next/navigation";

const OPEN_PAGES = ["/admin/billing", "/admin/security"];

export function BillingGate({
  slug,
  locked,
  canManage,
  children,
}: {
  slug: string;
  locked: boolean;
  canManage: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const open = OPEN_PAGES.some((p) => pathname.startsWith(`/o/${slug}${p}`));
  if (!locked || open) return <>{children}</>;
  return (
    <section className="mx-auto max-w-xl py-16 text-center" data-testid="billing-wall">
      <h1 className="font-display text-3xl">Subscribe to keep using Compass</h1>
      <p className="mt-3 text-slate-soft">
        Your unit&apos;s free trial or subscription has ended. Everything you set up is still
        here, and your public site and members&apos; pages are still up.
      </p>
      {canManage ? (
        <Link href={`/o/${slug}/admin/billing`} className="btn-primary mt-8 inline-flex">
          Go to billing →
        </Link>
      ) : (
        <p className="mt-6 text-sm text-slate-muted">Ask your unit&apos;s admin to subscribe.</p>
      )}
    </section>
  );
}
