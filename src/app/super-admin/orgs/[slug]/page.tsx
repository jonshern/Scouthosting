// /super-admin/orgs/[slug] — single-org operator detail page with
// suspend / restore / plan-change controls.

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { deriveBillingStatus } from "@/lib/billing/state";
import { planLabel } from "@/lib/billing/plans";
import {
  suspendOrgAction,
  restoreOrgAction,
  changeOrgPlanAction,
} from "@/server-actions/super-admin";

const PLANS = ["patrol", "troop", "council"] as const;

export default async function SuperOrgDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) return notFound();

  const billing = deriveBillingStatus(org);
  const memberCount = await prisma.member.count({ where: { orgId: org.id } });
  const userCount = await prisma.orgMembership.count({
    where: { orgId: org.id },
  });

  return (
    <section className="space-y-6">
      <header>
        <h2 className="font-display text-2xl">{org.displayName}</h2>
        <p className="text-sm text-ink-muted">
          <span className="font-mono">{org.slug}</span> · {planLabel(org.plan)}
          {" · "}
          {billing.status}
          {billing.gate === "suspended" ? " · suspended" : ""}
          {" · "}
          created {org.createdAt.toLocaleDateString()}
        </p>
        <p className="text-sm mt-1">
          {memberCount} members · {userCount} users
        </p>
      </header>

      <section className="card">
        <h3 className="font-medium mb-2">Plan</h3>
        <form action={changeOrgPlanAction} className="flex items-center gap-2">
          <CsrfTokenInput />
          <input type="hidden" name="orgId" value={org.id} />
          <select name="plan" defaultValue={org.plan} className="input text-sm">
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {planLabel(p)}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-secondary text-xs">
            Change plan
          </button>
        </form>
      </section>

      <section className="card">
        <h3 className="font-medium mb-2">Lifecycle</h3>
        {org.suspendedAt ? (
          <form action={restoreOrgAction}>
            <CsrfTokenInput />
            <input type="hidden" name="orgId" value={org.id} />
            <p className="text-sm text-amber-700 mb-2">
              Suspended {org.suspendedAt.toLocaleDateString()}
              {org.suspendedReason ? ` — ${org.suspendedReason}` : ""}
            </p>
            <button type="submit" className="btn-primary text-xs">
              Restore
            </button>
          </form>
        ) : (
          <form action={suspendOrgAction} className="space-y-2">
            <CsrfTokenInput />
            <input type="hidden" name="orgId" value={org.id} />
            <input
              name="reason"
              type="text"
              placeholder="Reason (visible to the org)"
              required
              className="input text-sm w-full"
            />
            <button type="submit" className="btn-secondary text-xs">
              Suspend org
            </button>
          </form>
        )}
      </section>
    </section>
  );
}
