// /super-admin — owner console overview: licenses by state, who signed
// up lately, what needs a look (trials about to end, failed payments,
// errors, unanswered questions).

import Link from "next/link";
import { overview, type UnitRow } from "@/lib/owner/console";
import { signupQueue } from "@/lib/owner/signups";
import { platformUsage } from "@/lib/owner/usage";
import { LicensePill, Section, Stat, shortDate } from "@/components/owner/ConsoleBits";

export const dynamic = "force-dynamic";

function UnitList({ units, empty }: { units: UnitRow[]; empty: string }) {
  if (units.length === 0) return <p className="text-sm text-ink-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
      {units.map((u) => (
        <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
          <Link href={`/super-admin/orgs/${u.slug}`} className="font-medium">
            {u.displayName}
          </Link>
          <span className="flex items-center gap-2 text-xs text-ink-muted">
            {u.license.detail}
            <LicensePill license={u.license} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export default async function OwnerOverviewPage() {
  const [o, signups, usage] = await Promise.all([overview(), signupQueue(), platformUsage({ days: 30 })]);
  const paying = o.units.paid + o.units.canceling;

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Units" value={o.totalUnits} hint={`${o.newUnits7d} new this week`} href="/super-admin/orgs" />
        <Stat label="Paying" value={paying} hint={`${o.units.canceling} canceling`} href="/super-admin/orgs?kind=paid" />
        <Stat label="On trial" value={o.units.trial} hint={`${o.trialsEndingSoon.length} end within 7 days`} href="/super-admin/orgs?kind=trial" />
        <Stat
          label="Past due"
          value={o.units.past_due}
          hint={`${o.units.trial_ended} trials ended unpaid`}
          href="/super-admin/orgs?kind=past_due"
          tone={o.units.past_due > 0 ? "bad" : undefined}
        />
        <Stat
          label="Active units, last 30 days"
          value={usage.units.active + usage.units.quiet}
          hint={`${usage.units.dormant} dormant, ${usage.payingDormant.length} of them paying`}
          href="/super-admin/usage"
          tone={usage.payingDormant.length > 0 ? "warn" : undefined}
        />
        <Stat label="Accounts" value={o.accounts} hint={`${o.newAccounts7d} new this week`} href="/super-admin/people" />
        <Stat
          label="Lantern families"
          value={o.lanternFamilies}
          hint={`${o.lanternScouts} scouts on trails`}
          href="/super-admin/people?product=lantern"
        />
        <Stat label="Waypoint counselors" value={o.counselors} href="/super-admin/people?product=waypoint" />
        <Stat
          label="Questions waiting"
          value={o.openTickets}
          hint={`${o.newFeedback} new roadmap requests`}
          href="/super-admin/inbox"
          tone={o.openTickets > 0 ? "warn" : undefined}
        />
        <Stat label="Sign-ups to follow up" value={signups.length} hint="last 30 days" href="/super-admin/signups" />
        <Stat
          label="Errors, last 24 hours"
          value={o.errors24h}
          hint={`${o.errorKinds24h} different kinds`}
          href="/super-admin/errors"
          tone={o.errors24h > 0 ? "warn" : undefined}
        />
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <Section title="Trials ending this week">
          <UnitList units={o.trialsEndingSoon} empty="No trial ends in the next 7 days." />
        </Section>
        <Section title="Needs a look">
          <UnitList units={o.needsAttention} empty="Nothing past due, canceling, suspended or ended unpaid." />
        </Section>
      </div>

      <Section title="Newest units" action={<Link href="/super-admin/orgs" className="text-sm">All units →</Link>}>
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {o.recentUnits.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
              <span>
                <Link href={`/super-admin/orgs/${u.slug}`} className="font-medium">
                  {u.displayName}
                </Link>
                <span className="ml-2 text-xs text-ink-muted">
                  {u.city}, {u.state} · {u.owner?.email ?? "no owner"} · signed up {shortDate(u.createdAt)}
                </span>
              </span>
              <LicensePill license={u.license} />
            </li>
          ))}
        </ul>
      </Section>

    </div>
  );
}
