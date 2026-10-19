// /super-admin/usage — is each unit actually using Compass? Counts of
// the things people made in the window (events, chat messages, posts,
// photos, RSVPs, sign-offs) and who signed in, per unit and in total,
// with each unit marked active, quiet, dormant or not started. Page
// views live on the analytics page.

import Link from "next/link";
import {
  platformUsage,
  USAGE_COUNT_LABEL,
  USAGE_STATE_LABEL,
  USAGE_STATES,
  type UnitUsage,
  type UsageCounts,
  type UsageState,
} from "@/lib/owner/usage";
import { LicensePill, Section, Stat, UsageStatePill, shortDate } from "@/components/owner/ConsoleBits";
import { requireOwnerPage } from "@/lib/owner/guard";

export const dynamic = "force-dynamic";

const DAYS = [7, 30, 90];
const COLUMNS: (keyof UsageCounts)[] = ["peopleSignedIn", "events", "messages", "posts", "photos", "rsvps", "signoffs"];
const SHORT: Record<keyof UsageCounts, string> = {
  peopleSignedIn: "Signed in",
  events: "Events",
  messages: "Messages",
  posts: "Posts",
  photos: "Photos",
  rsvps: "RSVPs",
  signoffs: "Sign-offs",
};

function UnitLinks({ rows, empty }: { rows: UnitUsage[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-ink-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-surface text-sm">
      {rows.map((r) => (
        <li key={r.unit.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
          <Link href={`/super-admin/orgs/${r.unit.slug}`} className="font-medium">
            {r.unit.displayName}
          </Link>
          <span className="flex items-center gap-2 text-xs text-ink-muted">
            {r.lastActiveAt ? `last active ${shortDate(r.lastActiveAt)}` : "never active"}
            <LicensePill license={r.unit.license} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export default async function OwnerUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; state?: string }>;
}) {
  await requireOwnerPage();
  const sp = await searchParams;
  const days = DAYS.find((d) => String(d) === sp.days) ?? 30;
  const state = USAGE_STATES.find((s) => s === sp.state) ?? null;
  const u = await platformUsage({ days });
  const rows = u.rows
    .filter((r) => !r.unit.isDemo && (!state || r.state === state))
    .sort((a, b) => (b.lastActiveAt?.getTime() ?? 0) - (a.lastActiveAt?.getTime() ?? 0));
  const href = (d: number, s: UsageState | null) => {
    const q = new URLSearchParams();
    if (d !== 30) q.set("days", String(d));
    if (s) q.set("state", s);
    const str = q.toString();
    return str ? `/super-admin/usage?${str}` : "/super-admin/usage";
  };

  return (
    <div className="space-y-10">
      <Section title={`Usage, last ${days} days`}>
        <nav aria-label="Window" className="flex flex-wrap gap-4 text-sm">
          {DAYS.map((d) => (
            <Link key={d} href={href(d, state)} className={days === d ? "font-semibold underline" : ""}>
              {d} days
            </Link>
          ))}
        </nav>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {USAGE_STATES.map((s) => (
            <Stat
              key={s}
              label={`${USAGE_STATE_LABEL[s]} units`}
              value={u.units[s]}
              href={href(days, s)}
              tone={s === "dormant" && u.units.dormant > 0 ? "warn" : undefined}
            />
          ))}
          {COLUMNS.map((k) => (
            <Stat key={k} label={USAGE_COUNT_LABEL[k]} value={u.totals[k]} />
          ))}
          <Stat
            label="Lantern steps checked"
            value={u.lantern.stepsChecked}
            hint={`${u.lantern.families} families, ${u.lantern.entries} logs and photos`}
          />
          <Stat
            label="People on the apps"
            value={u.apps.compass + u.apps.waypoint + u.apps.lantern}
            hint={`Compass ${u.apps.compass}, Waypoint ${u.apps.waypoint}, Lantern ${u.apps.lantern}`}
          />
        </div>
        <p className="text-xs text-ink-muted">
          Active means something happened in the last 7 days; quiet, earlier in the window; not started, a unit under two
          weeks old with nothing yet; dormant, nothing in the window.
        </p>
      </Section>

      <div className="grid gap-8 md:grid-cols-2">
        <Section title="Paying but dormant">
          <UnitLinks rows={u.payingDormant} empty="Every paying unit did something in the window." />
        </Section>
        <Section title="On trial and active this week">
          <UnitLinks rows={u.trialActive} empty="No trial unit was active this week." />
        </Section>
      </div>

      <Section title={`${state ? USAGE_STATE_LABEL[state] : "Every"} unit (${rows.length})`}>
        <nav aria-label="State" className="flex flex-wrap gap-4 text-sm">
          <Link href={href(days, null)} className={!state ? "font-semibold underline" : ""}>
            All
          </Link>
          {USAGE_STATES.map((s) => (
            <Link key={s} href={href(days, s)} className={state === s ? "font-semibold underline" : ""}>
              {USAGE_STATE_LABEL[s]}
            </Link>
          ))}
        </nav>
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-muted">
              <tr>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2">Last active</th>
                {COLUMNS.map((k) => (
                  <th key={k} className="px-3 py-2 text-right">
                    {SHORT[k]}
                  </th>
                ))}
                <th className="px-3 py-2 text-right">Coming up</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.unit.id}>
                  <td className="px-3 py-2">
                    <Link href={`/super-admin/orgs/${r.unit.slug}`} className="font-medium">
                      {r.unit.displayName}
                    </Link>{" "}
                    <UsageStatePill state={r.state} /> <LicensePill license={r.unit.license} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-ink-muted">{r.lastActiveAt ? shortDate(r.lastActiveAt) : "never"}</td>
                  {COLUMNS.map((k) => (
                    <td key={k} className="px-3 py-2 text-right tabular-nums">
                      {r.counts[k]}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right tabular-nums">{r.upcomingEvents}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
