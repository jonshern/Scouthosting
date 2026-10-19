// Admin chrome (Modern Clean, Admin board): AdminTopNav on top, the
// billing banner under it, then the page body at max-w-[1400px].

import Link from "next/link";
import { adminAccess } from "@/lib/admin/guard";
import { AdminTopNav } from "@/components/admin/AdminTopNav";
import { ReleasesStrip } from "@/components/site/ReleasesStrip";
import { BillingGate } from "@/components/admin/BillingGate";
import { canManageBilling } from "@/lib/billing/access";
import { billingBanner } from "@/lib/billing/state";
import { isConfigured } from "@/lib/billing/stripe";
import { billingSummary } from "@/lib/billing/trial";
import { unitName } from "@/lib/tenancy/unit-name";

function initials(email: string, displayName: string | null | undefined): string {
  const src = (displayName ?? email).trim();
  if (!src) return "·";
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const name = (await unitName(slug)) ?? "Compass";
  return { title: { default: `Admin — ${name}`, template: `%s · Admin — ${name}` } };
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
        <h1 className="text-2xl font-semibold">Not authorized</h1>
        <p className="mt-2 text-muted">Ask a leader to grant you admin access.</p>
        <p className="mt-4 text-sm">
          <Link href={`/o/${slug}`}>Back to the unit&rsquo;s site</Link>
        </p>
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
            "border-b px-4 py-2.5 text-sm sm:px-8 " +
            (banner.tone === "info"
              ? "border-accent/15 bg-accent-soft text-ink"
              : banner.tone === "warn"
                ? "border-attention/25 bg-attention-soft text-ink"
                : "border-danger-line bg-danger-soft text-danger")
          }
        >
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-1">
            <strong className="font-semibold">{banner.headline}</strong>
            <span className="text-ink-2">{banner.body}</span>
            {canManage && (
              <Link href={`/o/${slug}/admin/billing`} className="font-semibold text-accent-text hover:text-ink">
                Billing →
              </Link>
            )}
          </div>
        </div>
      )}
      <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8 sm:py-10">
        <BillingGate slug={slug} locked={billing.locked} canManage={canManage}>
          {children}
        </BillingGate>
      </main>
      <ReleasesStrip variant="admin" />
    </div>
  );
}
