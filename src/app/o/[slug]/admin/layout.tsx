// Admin chrome. Replaces the old sidebar with the AdminBalanced
// top-nav from design_handoff_compass — Compass wordmark left, primary
// section links + sky-blue underline for the active section, settings
// links on the right. The page body is constrained to max-w-[1400px]
// at 32–40px gutters per the design.

import Link from "next/link";
import { adminAccess } from "@/lib/admin/guard";
import { AdminTopNav } from "@/components/admin/AdminTopNav";
import { ReleasesStrip } from "@/components/site/ReleasesStrip";
import { BillingGate } from "@/components/admin/BillingGate";
import { canManageBilling } from "@/lib/billing/access";
import { billingBanner } from "@/lib/billing/state";
import { isConfigured } from "@/lib/billing/stripe";
import { billingSummary } from "@/lib/billing/trial";

function initials(email: string, displayName: string | null | undefined): string {
  const src = (displayName ?? email).trim();
  if (!src) return "·";
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Pages check again themselves (lib/admin/guard.ts): partial RSC
  // requests can skip this layout.
  const access = await adminAccess(slug);
  if (!access.ok) {
    return (
      <section className="mx-auto max-w-content px-6 py-16">
        <h1 className="font-display text-2xl font-semibold">Not authorized</h1>
        <p className="mt-2 text-slate-muted">Ask a leader to grant you admin access.</p>
      </section>
    );
  }
  const { org, user } = access;
  const unitLabel = `${org.unitType ?? ""} ${org.unitNumber ?? ""}`.trim() || org.displayName;
  const billing = billingSummary(org, { stripeConfigured: isConfigured() });
  const canManage = await canManageBilling(user, org);
  const banner = billingBanner({
    status: billing.status,
    gate: billing.gate,
    trialDaysLeft: billing.trialDaysLeft,
    inGrace: billing.gate === "writeable",
    reason: null,
  });
  return (
    <div className="min-h-screen bg-bg">
      <AdminTopNav
        slug={slug}
        initials={initials(user.email, null)}
        unitLabel={unitLabel}
      />
      {banner && (
        <div
          role="status"
          data-testid="billing-banner"
          className={
            "border-b px-8 py-2.5 text-sm " +
            (banner.tone === "info"
              ? "border-sky/20 bg-sky/5 text-slate-ink"
              : banner.tone === "warn"
                ? "border-amber/30 bg-amber/10 text-slate-ink"
                : "border-red-200 bg-red-50 text-red-900")
          }
        >
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-1">
            <strong className="font-semibold">{banner.headline}</strong>
            <span className="text-slate-soft">{banner.body}</span>
            {canManage && (
              <Link href={`/o/${slug}/admin/billing`} className="font-semibold text-sky hover:text-slate-ink">
                Billing →
              </Link>
            )}
          </div>
        </div>
      )}
      <main className="mx-auto max-w-[1400px] px-8 py-10">
        <BillingGate slug={slug} locked={billing.locked} canManage={canManage}>
          {children}
        </BillingGate>
      </main>
      <ReleasesStrip variant="admin" />
    </div>
  );
}
