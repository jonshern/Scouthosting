// /o/[slug]/admin/advancement — where every scout stands. Ranks, next
// rank progress and merit badges for the whole unit, requirements
// waiting for a leader's sign-off (signed off right here), and awards
// earned but not yet presented at a court of honor.
// Data: lib/advancement/unit.ts.

import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { Pill, Stat, StatRow } from "@/components/ui";
import { requireAdminPage } from "@/lib/admin/guard";
import { unitAdvancement, type ReadyAward, type ScoutAdvancement } from "@/lib/advancement/unit";
import { signOffRequirement } from "@/server-actions/advancement";

export const metadata = { title: "Advancement" };
export const dynamic = "force-dynamic";

const WAITING_SHOWN = 50;

const shortDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default async function AdvancementPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ patrol?: string; signed?: string; error?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const { org } = await requireAdminPage(slug);
  if (!org) notFound();
  const patrol = sp.patrol?.trim() || null;
  const data = await unitAdvancement(org, { patrol });
  const href = (p: string | null) => `/o/${slug}/admin/advancement${p ? `?patrol=${encodeURIComponent(p)}` : ""}`;
  const csv = `/o/${slug}/admin/advancement/advancement.csv${patrol ? `?patrol=${encodeURIComponent(patrol)}` : ""}`;
  const earnedThisYear = data.ready.length;

  return (
    <section className="space-y-10">
      <AdminPageHeader
        kicker="Roster"
        title="Advancement"
        description="Where every scout stands, from sign-offs in Compass, Waypoint and Lantern, your Scoutbook import and your court of honor records."
        actions={
          <a href={csv} className="btn-secondary no-underline">
            Download spreadsheet
          </a>
        }
      />

      {sp.signed ? (
        <p role="status" className="rounded-lg bg-done-soft px-4 py-3 text-sm text-done-text">
          Signed off. It shows in Waypoint and the family&apos;s Lantern too.
        </p>
      ) : null}
      {sp.error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          {sp.error}
        </p>
      ) : null}

      <StatRow>
        <Stat label="Scouts" value={data.scouts.length} sub={patrol ? `${patrol} patrol` : "Active youth on the roster"} />
        <Stat
          label="Waiting for sign-off"
          value={data.waiting.length}
          tone={data.waiting.length ? "accent" : "default"}
          sub="Requirements scouts marked done"
        />
        <Stat label="Ready to present" value={earnedThisYear} sub="Earned in the last year, not yet at a court of honor" />
        <Stat
          label="Merit badges earned"
          value={data.scouts.reduce((n, s) => n + s.summary.badgesEarned.length, 0)}
          sub="All time, across these scouts"
        />
      </StatRow>

      {data.patrols.length > 0 ? (
        <nav aria-label="Patrol" className="flex flex-wrap gap-2 text-sm">
          {[null, ...data.patrols].map((p) => (
            <Link
              key={p ?? "all"}
              href={href(p)}
              aria-current={p === patrol ? "page" : undefined}
              className={
                "rounded-lg border px-3 py-1.5 no-underline transition-colors " +
                (p === patrol ? "border-ink bg-ink text-surface hover:text-surface" : "border-line bg-surface text-ink-2 hover:bg-sunk hover:text-ink")
              }
            >
              {p ?? "All scouts"}
            </Link>
          ))}
        </nav>
      ) : null}

      {!data.catalogLoaded ? (
        <p className="rounded-lg border border-line bg-surface-alt px-4 py-3 text-sm text-ink-2">
          Requirement wording isn&apos;t loaded on this server yet, so next-rank progress shows counts without totals.
        </p>
      ) : null}

      <div id="waiting" className="space-y-3">
        <h2 className="text-2xl font-semibold tracking-[-0.015em] text-ink">Waiting for your sign-off</h2>
        {data.waiting.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing waiting. When a scout marks a requirement done in Lantern, or a parent does in Compass, it shows up here.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
              {data.waiting.slice(0, WAITING_SHOWN).map((w) => (
                <li key={`${w.memberId}:${w.requirementId}`} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink">
                      <Link href={`/o/${slug}/admin/members/${w.memberId}?tab=advancement`}>{w.name}</Link>
                      <span className="text-muted"> · {w.itemName} {w.number}</span>
                    </div>
                    {w.text ? <p className="mt-0.5 line-clamp-2 text-sm text-ink-2">{w.text}</p> : null}
                    <p className="mt-0.5 text-xs text-muted">Marked done {shortDate(w.since)}</p>
                  </div>
                  <form action={signOffRequirement} className="shrink-0">
                    <CsrfTokenInput />
                    <input type="hidden" name="orgSlug" value={slug} />
                    <input type="hidden" name="memberId" value={w.memberId} />
                    <input type="hidden" name="requirementId" value={w.requirementId} />
                    {patrol ? <input type="hidden" name="patrol" value={patrol} /> : null}
                    <button type="submit" className="btn-primary min-h-[44px] w-full sm:w-auto">
                      Sign off
                    </button>
                  </form>
                </li>
              ))}
            </ul>
            {data.waiting.length > WAITING_SHOWN ? (
              <p className="text-xs text-muted">
                Showing the oldest {WAITING_SHOWN} of {data.waiting.length}. Sign these off and the rest move up.
              </p>
            ) : null}
          </>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-2xl font-semibold tracking-[-0.015em] text-ink">Every scout</h2>
        {data.scouts.length === 0 ? (
          <p className="text-sm text-muted">
            No active scouts{patrol ? " in this patrol" : ""} yet. <Link href={`/o/${slug}/admin/members`}>Add scouts to the roster →</Link>
          </p>
        ) : (
          <>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface md:hidden">
            {data.scouts.map((s) => (
              <ScoutCard key={s.memberId} slug={slug} s={s} />
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-xl border border-line bg-surface md:block">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-surface-alt text-left font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">Scout</th>
                  <th className="px-4 py-2 font-semibold">Rank</th>
                  <th className="px-4 py-2 font-semibold">Next rank</th>
                  <th className="px-4 py-2 font-semibold">Merit badges</th>
                  <th className="px-4 py-2 font-semibold">Working on</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.scouts.map((s) => (
                  <ScoutRow key={s.memberId} slug={slug} s={s} />
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-[-0.015em] text-ink">Ready for a court of honor</h2>
          <Link href={`/o/${slug}/admin/coh`} className="text-sm">
            Court of honor list →
          </Link>
        </div>
        {data.ready.length === 0 ? (
          <p className="text-sm text-muted">Nothing earned in the last year is waiting to be presented.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface text-sm">
            {groupByScout(data.ready).map((g) => (
              <li key={g.memberId} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-6">
                <span className="w-40 shrink-0 font-medium text-ink">{g.name}</span>
                <span className="flex flex-wrap gap-2">
                  {g.awards.map((r) => (
                    <Pill key={r.award} tone={r.kind === "rank" ? "accent" : "neutral"}>
                      {r.award}
                      {r.earnedAt ? <span className="font-normal opacity-70"> · {shortDate(r.earnedAt)}</span> : null}
                    </Pill>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ScoutRow({ slug, s }: { slug: string; s: ScoutAdvancement }) {
  const n = s.summary.nextRank;
  const earned = s.summary.badgesEarned;
  const eagle = earned.filter((b) => b.eagle).length;
  const working = s.summary.badgesInProgress;
  return (
    <tr className="align-top">
      <td className="px-4 py-3">
        <Link href={`/o/${slug}/admin/members/${s.memberId}?tab=advancement`} className="font-medium">
          {s.name}
        </Link>
        {s.patrol ? <div className="text-xs text-muted">{s.patrol}</div> : null}
      </td>
      <td className="px-4 py-3 text-ink">
        {s.summary.rank ? s.summary.rank.name : <span className="text-muted">None yet</span>}
      </td>
      <td className="px-4 py-3">
        {n ? (
          <div className="min-w-[140px]">
            <div className="text-ink">{n.name}</div>
            {n.total ? (
              <>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-sunk" aria-hidden>
                  <div className="h-full rounded-full bg-done" style={{ width: `${n.percent}%` }} />
                </div>
                <div className="mt-1 text-xs text-muted">
                  {n.completed} of {n.total}
                  {n.waiting ? ` · ${n.waiting} waiting` : ""}
                </div>
              </>
            ) : s.waiting ? (
              <div className="mt-1 text-xs text-muted">{s.waiting} waiting</div>
            ) : null}
          </div>
        ) : (
          <span className="text-muted">Eagle</span>
        )}
      </td>
      <td className="px-4 py-3 text-ink">
        {earned.length}
        {eagle ? <span className="text-xs text-muted"> · {eagle} Eagle-required</span> : null}
      </td>
      <td className="px-4 py-3 text-ink-2">
        {working.length === 0 ? (
          <span className="text-muted">—</span>
        ) : (
          <>
            {working
              .slice(0, 2)
              .map((b) => (b.total ? `${b.name} ${b.percent}%` : b.name))
              .join(", ")}
            {working.length > 2 ? <span className="text-muted"> +{working.length - 2} more</span> : null}
          </>
        )}
      </td>
    </tr>
  );
}

function groupByScout(ready: ReadyAward[]) {
  const out: { memberId: string; name: string; awards: ReadyAward[] }[] = [];
  for (const r of ready) {
    const g = out.find((x) => x.memberId === r.memberId);
    if (g) g.awards.push(r);
    else out.push({ memberId: r.memberId, name: r.name, awards: [r] });
  }
  return out;
}

/** The phone version of a ScoutRow. */
function ScoutCard({ slug, s }: { slug: string; s: ScoutAdvancement }) {
  const n = s.summary.nextRank;
  const earned = s.summary.badgesEarned.length;
  const working = s.summary.badgesInProgress;
  return (
    <li className="space-y-2 px-4 py-3 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <Link href={`/o/${slug}/admin/members/${s.memberId}?tab=advancement`} className="font-medium">
          {s.name}
        </Link>
        <span className="text-xs text-muted">{s.patrol ?? ""}</span>
      </div>
      <div className="text-ink-2">
        {s.summary.rank ? s.summary.rank.name : "No rank yet"}
        {n ? <span className="text-muted"> → {n.name}</span> : null}
      </div>
      {n?.total ? (
        <div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-sunk" aria-hidden>
            <div className="h-full rounded-full bg-done" style={{ width: `${n.percent}%` }} />
          </div>
          <div className="mt-1 text-xs text-muted">
            {n.completed} of {n.total}
            {n.waiting ? ` · ${n.waiting} waiting` : ""}
          </div>
        </div>
      ) : null}
      <div className="text-xs text-muted">
        {earned} merit badge{earned === 1 ? "" : "s"}
        {working.length ? ` · working on ${working.map((b) => b.name).slice(0, 2).join(", ")}${working.length > 2 ? ` +${working.length - 2}` : ""}` : ""}
      </div>
    </li>
  );
}
