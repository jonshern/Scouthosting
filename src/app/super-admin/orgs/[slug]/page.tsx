// /super-admin/orgs/[slug] — one unit: its license, people, and the
// owner's controls (extend trial, free access, plan, suspend). Every
// control is audit-logged; the unit's history is at the bottom.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { planLabel } from "@/lib/billing/plans";
import { licenseFor } from "@/lib/owner/license";
import { Done, LicensePill, Section, shortDate } from "@/components/owner/ConsoleBits";
import {
  changeOrgPlanAction,
  compOrgAction,
  endCompAction,
  extendTrialAction,
  restoreOrgAction,
  suspendOrgAction,
} from "@/server-actions/super-admin";
import { requireOwnerPage } from "@/lib/owner/guard";

export const dynamic = "force-dynamic";

const PLANS = ["patrol", "troop", "council"] as const;

export default async function OwnerUnitPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  await requireOwnerPage();
  const { slug } = await params;
  const { done } = await searchParams;
  const org = await prisma.org.findUnique({
    where: { slug },
    include: { owner: { select: { id: true, email: true, displayName: true } } },
  });
  if (!org) return notFound();

  const license = licenseFor(org);
  const [members, memberships, history, errors, tickets] = await Promise.all([
    prisma.member.groupBy({ by: ["isYouth"], where: { orgId: org.id }, _count: { _all: true } }),
    prisma.orgMembership.findMany({
      where: { orgId: org.id },
      orderBy: [{ role: "desc" }, { createdAt: "asc" }],
      take: 50,
      select: { role: true, createdAt: true, user: { select: { id: true, email: true, displayName: true, disabledAt: true } } },
    }),
    prisma.auditLog.findMany({
      where: { orgId: org.id, OR: [{ action: { startsWith: "org." } }, { action: { startsWith: "billing." } }] },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.errorLog.count({ where: { orgId: org.id, createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } } }),
    prisma.supportTicket.count({ where: { orgId: org.id, status: { in: ["open", "acknowledged"] } } }),
  ]);
  const scouts = members.find((m) => m.isYouth)?._count._all ?? 0;
  const adultsOnRoster = members.find((m) => !m.isYouth)?._count._all ?? 0;
  const inAMonth = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <Link href="/super-admin/orgs" className="text-sm">
          ← Units
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[32px] font-semibold leading-tight tracking-[-0.03em]">{org.displayName}</h2>
          <LicensePill license={license} />
        </div>
        <p className="text-sm text-ink-muted">
          {license.detail}
        </p>
        <p className="text-sm text-ink-muted">
          <span className="font-mono">{org.slug}</span> · {org.city}, {org.state}
          {org.council ? ` · ${org.council}` : ""} · signed up {shortDate(org.createdAt)} · owner{" "}
          {org.owner ? <Link href={`/super-admin/people/${org.owner.id}`}>{org.owner.email}</Link> : "none"}
        </p>
        <p className="text-sm">
          {memberships.length} accounts · {scouts} scouts and {adultsOnRoster} adults on the roster ·{" "}
          <Link href={`/super-admin/errors?org=${org.slug}`}>{errors} errors this week</Link> · {tickets} open questions
        </p>
        <Done message={done} />
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Trial">
          <div className="card space-y-2 text-sm">
            <p>
              {org.trialEndsAt ? `Trial ${org.trialEndsAt > new Date() ? "ends" : "ended"} ${shortDate(org.trialEndsAt)}.` : "No trial date (unit made before self-serve sign-up)."}
            </p>
            <form action={extendTrialAction} className="flex flex-wrap items-center gap-2">
              <CsrfTokenInput />
              <input type="hidden" name="orgId" value={org.id} />
              <label htmlFor="days">Add</label>
              <input id="days" name="days" type="number" min={1} max={365} defaultValue={14} className="field w-20" />
              <span>days</span>
              <button type="submit" className="btn-secondary text-xs">
                Extend trial
              </button>
            </form>
            <p className="text-xs text-ink-muted">A trial that already ended restarts from today.</p>
          </div>
        </Section>

        <Section title="Free access">
          <div className="card space-y-2 text-sm">
            {org.compedUntil ? (
              <form action={endCompAction} className="space-y-2">
                <CsrfTokenInput />
                <input type="hidden" name="orgId" value={org.id} />
                <p>
                  Free until {shortDate(org.compedUntil)}
                  {org.compedNote ? ` (${org.compedNote})` : ""}.
                </p>
                <button type="submit" className="btn-secondary text-xs">
                  End free access
                </button>
              </form>
            ) : null}
            <form action={compOrgAction} className="space-y-2">
              <CsrfTokenInput />
              <input type="hidden" name="orgId" value={org.id} />
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="until">Free until</label>
                <input id="until" name="until" type="date" defaultValue={inAMonth} required className="field" />
              </div>
              <input name="note" type="text" maxLength={200} placeholder="Why (only you see this)" aria-label="Why" className="field w-full" />
              <button type="submit" className="btn-secondary text-xs">
                {org.compedUntil ? "Change free access" : "Give free access"}
              </button>
            </form>
            <p className="text-xs text-ink-muted">
              The unit counts as paid until that date. Stripe isn&apos;t touched, so a unit that already subscribed keeps
              being charged; cancel it in Stripe if it shouldn&apos;t be.
            </p>
          </div>
        </Section>

        <Section title="Plan">
          <div className="card text-sm">
            <form action={changeOrgPlanAction} className="flex items-center gap-2">
              <CsrfTokenInput />
              <input type="hidden" name="orgId" value={org.id} />
              <select name="plan" defaultValue={org.plan} aria-label="Plan" className="field text-sm">
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
            <p className="mt-2 text-xs text-ink-muted">Feature tier only; the price is the same for every plan.</p>
          </div>
        </Section>

        <Section title="Access">
          <div className="card text-sm">
            {org.suspendedAt ? (
              <form action={restoreOrgAction} className="space-y-2">
                <CsrfTokenInput />
                <input type="hidden" name="orgId" value={org.id} />
                <p className="text-danger">
                  Suspended {shortDate(org.suspendedAt)}
                  {org.suspendedReason ? `: ${org.suspendedReason}` : ""}
                </p>
                <button type="submit" className="btn-primary text-xs">
                  Reinstate
                </button>
              </form>
            ) : (
              <form action={suspendOrgAction} className="space-y-2">
                <CsrfTokenInput />
                <input type="hidden" name="orgId" value={org.id} />
                <input
                  name="reason"
                  type="text"
                  placeholder="Reason (shown on the unit's site)"
                  aria-label="Reason"
                  required
                  className="field w-full"
                />
                <button type="submit" className="btn-secondary text-xs">
                  Suspend unit
                </button>
                <p className="text-xs text-ink-muted">
                  The public site stays up with the reason; admin pages and app writes stop.
                </p>
              </form>
            )}
          </div>
        </Section>
      </div>

      <Section title="Stripe">
        <dl className="card grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-ink-muted">Status</dt>
          <dd>{org.subscriptionStatus}{org.cancelAtPeriodEnd ? " (cancels at period end)" : ""}</dd>
          <dt className="text-ink-muted">Customer</dt>
          <dd className="font-mono text-xs">{org.stripeCustomerId ?? "—"}</dd>
          <dt className="text-ink-muted">Subscription</dt>
          <dd className="font-mono text-xs">{org.stripeSubscriptionId ?? "—"}</dd>
          <dt className="text-ink-muted">Period ends</dt>
          <dd>{shortDate(org.currentPeriodEnd)}</dd>
        </dl>
      </Section>

      <Section title={`Accounts (${memberships.length})`}>
        <ul className="divide-y divide-divider rounded-xl border border-line bg-surface text-sm">
          {memberships.map((m) => (
            <li key={m.user.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
              <Link href={`/super-admin/people/${m.user.id}`}>
                {m.user.displayName} · {m.user.email}
              </Link>
              <span className="text-xs text-ink-muted">
                {m.role}
                {m.user.disabledAt ? " · turned off" : ""} · joined {shortDate(m.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="History"
        action={
          <Link href={`/super-admin/audit?org=${org.slug}`} className="text-sm">
            Full audit log →
          </Link>
        }
      >
        {history.length === 0 ? (
          <p className="text-sm text-ink-muted">No license or billing changes yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {history.map((h) => (
              <li key={h.id}>
                <span className="font-mono text-xs text-ink-muted">{h.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span>{" "}
                <span className="font-medium">{h.action}</span> by {h.userDisplay ?? "system"}
                {h.summary ? <span className="text-ink-muted"> · {h.summary}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
