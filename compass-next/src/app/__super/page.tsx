// /__super — orgs list (every Org row, paginated).

import Link from "next/link";
import { prisma } from "@/lib/db";
import { deriveBillingStatus } from "@/lib/billing/state";
import { planLabel } from "@/lib/billing/plans";

export default async function SuperOrgsPage() {
  const orgs = await prisma.org.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      slug: true,
      displayName: true,
      plan: true,
      isDemo: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      suspendedAt: true,
      suspendedReason: true,
      createdAt: true,
    },
  });

  return (
    <section>
      <h2 className="font-display text-xl mb-4">Orgs ({orgs.length})</h2>
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-ink-muted border-b border-ink-muted/15">
          <tr>
            <th className="py-2">Slug</th>
            <th>Name</th>
            <th>Plan</th>
            <th>Status</th>
            <th>Trial / period end</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {orgs.map((o) => {
            const billing = deriveBillingStatus(o);
            return (
              <tr key={o.id} className="border-b border-ink-muted/10">
                <td className="py-2 font-mono">
                  <Link href={`/__super/orgs/${o.slug}`}>{o.slug}</Link>
                </td>
                <td>
                  {o.displayName}
                  {o.isDemo ? (
                    <span className="ml-2 rounded bg-amber-100 text-amber-800 px-1 text-xs">
                      DEMO
                    </span>
                  ) : null}
                </td>
                <td>{planLabel(o.plan)}</td>
                <td>
                  {billing.status}
                  {billing.gate === "suspended" ? " · suspended" : ""}
                </td>
                <td className="text-xs text-ink-muted">
                  {(o.currentPeriodEnd || o.trialEndsAt)?.toLocaleDateString() ?? "—"}
                </td>
                <td className="text-xs text-ink-muted">
                  {o.createdAt.toLocaleDateString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
