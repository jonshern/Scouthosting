// /super-admin/analytics — who visits and what they do, across the
// landing page, Compass, Waypoint and Lantern (lib/usage). Filter by
// time window and product. Signed-in adults are listed by name and
// open to a timeline; signed-out visitors show only as a daily hash;
// scouts show only as counts.

import Link from "next/link";
import { Pill, Section, Stat, shortDate } from "@/components/owner/ConsoleBits";
import { actionLabel, USAGE_PRODUCTS, type UsageProduct } from "@/lib/usage/events";
import {
  actions,
  activePeople,
  browsers,
  byDay,
  byProduct,
  devices,
  liveVisitors,
  platforms,
  recentVisits,
  referrers,
  signupFunnel,
  sources,
  topPages,
  totals,
  unitActivity,
  type CountRow,
} from "@/lib/usage/report";

export const dynamic = "force-dynamic";

const WINDOWS = [1, 7, 30, 90] as const;

const CHIP_ON = "rounded-full bg-ink px-3 py-1 font-medium text-white no-underline hover:text-white";
const CHIP_OFF = "rounded-full border border-line bg-surface px-3 py-1 text-ink-2 no-underline hover:border-control hover:text-ink";

const PRODUCT_NAME: Record<string, string> = {
  landing: "Landing page",
  compass: "Compass",
  waypoint: "Waypoint",
  lantern: "Lantern",
};

function ago(d: Date, now = Date.now()): string {
  const mins = Math.round((now - d.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return shortDate(d);
}

const fmt = (v: number) => v.toLocaleString("en-US");

export default async function OwnerUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; product?: string }>;
}) {
  const sp = await searchParams;
  const days = WINDOWS.find((w) => String(w) === sp.days) ?? 7;
  const product = (USAGE_PRODUCTS as readonly string[]).includes(sp.product ?? "") ? (sp.product as UsageProduct) : null;
  const w = { days, product };
  const [sum, live, daily, products, pages, refs, srcs, devs, brs, plats, acts, funnel, units, people, visits] =
    await Promise.all([
      totals(w),
      liveVisitors(),
      byDay(w),
      byProduct({ days }),
      topPages(w),
      referrers(w),
      sources(w),
      devices(w),
      browsers(w),
      platforms(w),
      actions(w),
      signupFunnel({ days }),
      unitActivity(w),
      activePeople(w),
      recentVisits(w),
    ]);
  const href = (over: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const merged = { days: String(days), product, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    return `/super-admin/analytics?${q.toString()}`;
  };
  const peak = Math.max(1, ...daily.map((d) => d.views));
  const empty = sum.views === 0 && sum.actions === 0;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h2 className="text-[28px] font-semibold leading-tight tracking-[-0.03em]">Usage{product ? ` · ${PRODUCT_NAME[product]}` : ""}</h2>
        <nav aria-label="Usage filters" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {WINDOWS.map((d) => (
            <Link key={d} href={href({ days: String(d) })} className={days === d ? CHIP_ON : CHIP_OFF}>
              {d === 1 ? "Last day" : `Last ${d} days`}
            </Link>
          ))}
          <span className="text-ink-muted">·</span>
          <Link href={href({ product: null })} className={!product ? CHIP_ON : CHIP_OFF}>
            Everything
          </Link>
          {USAGE_PRODUCTS.map((p) => (
            <Link key={p} href={href({ product: p })} className={product === p ? CHIP_ON : CHIP_OFF}>
              {PRODUCT_NAME[p]}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Right now" value={fmt(live)} hint="visitors, last 30 minutes" />
        <Stat label="Visitors" value={fmt(sum.visitors)} hint="one person on one day" />
        <Stat label="Visits" value={fmt(sum.visits)} hint={sum.visits ? `${(sum.views / sum.visits).toFixed(1)} pages each` : "no gap over 30 min"} />
        <Stat label="Page views" value={fmt(sum.views)} hint="pages and app screens" />
        <Stat label="Signed-in people" value={fmt(sum.signedIn)} hint={sum.scoutDevices ? `plus ${fmt(sum.scoutDevices)} scout trails` : "adults and scouts"} />
      </div>

      {empty ? (
        <p className="rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink-muted">
          Nothing recorded in this window yet. Views arrive as people open the landing page, Compass, Waypoint and
          Lantern; browsers that ask not to be tracked, crawlers and test browsers are left out.
        </p>
      ) : null}

      <Section title="By day">
        <ol className="flex h-36 items-end gap-px rounded-lg border border-line bg-surface p-3" aria-label="Page views by day">
          {daily.map((d) => (
            <li
              key={d.day}
              className="flex-1 rounded-t bg-accent/70"
              style={{ height: `${Math.max(2, (d.views / peak) * 100)}%` }}
              title={`${d.day}: ${d.visitors} visitors, ${d.views} views`}
            >
              <span className="sr-only">
                {d.day}: {d.visitors} visitors, {d.views} views
              </span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-ink-muted">
          {daily[0]?.day} to {daily[daily.length - 1]?.day}. Hover a bar for the day.
        </p>
      </Section>

      {!product ? (
        <Section title="Products">
          <Table
            head={["Product", "Visitors", "Views", "Signed in", "Actions"]}
            rows={products.map((p) => [
              <Link key={p.product} href={href({ product: p.product })}>
                {PRODUCT_NAME[p.product] ?? p.product}
              </Link>,
              fmt(p.visitors),
              fmt(p.views),
              fmt(p.signedIn),
              fmt(p.actions),
            ])}
          />
        </Section>
      ) : null}

      <Section title="Sign-up funnel">
        <ol className="grid gap-2 md:grid-cols-5">
          {funnel.map((s, i) => (
            <li key={s.label} className="rounded-lg border border-line bg-surface p-3">
              <div className="text-xs text-ink-muted">
                {i + 1}. {s.label}
              </div>
              <div className="mt-1 text-[28px] font-semibold leading-tight tracking-[-0.02em]">{fmt(s.count)}</div>
              <div className="text-xs text-ink-muted">
                {s.hint}
                {i > 0 && funnel[i - 1].count > 0 ? ` · ${Math.round((s.count / funnel[i - 1].count) * 100)}% of step ${i}` : ""}
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Top pages and screens">
          <Table
            head={["Page", "Views", "Visitors"]}
            rows={pages.map((p) => [
              <span key={p.path} className="font-mono text-xs">
                {!product ? <span className="text-ink-muted">{p.product} </span> : null}
                {p.path}
              </span>,
              fmt(p.views),
              fmt(p.visitors),
            ])}
          />
        </Section>
        <Section title="What people did">
          <Table
            head={["Action", "Times", "People"]}
            rows={acts.map((a) => [
              <span key={`${a.product}-${a.name}`}>
                {actionLabel(a.name)} <Pill tone="muted">{a.product}</Pill>
              </span>,
              fmt(a.count),
              fmt(a.people),
            ])}
          />
        </Section>
        <Section title="Where they came from">
          <Counts title="Sites" rows={refs} empty="No outside sites yet." />
          <Counts title="Campaign tags (utm_source or ref)" rows={srcs} empty="No tagged links yet." />
        </Section>
        <Section title="What they used">
          <Counts title="Device" rows={devs} />
          <Counts title="Web or app" rows={plats} />
          <Counts title="Browser" rows={brs} />
        </Section>
      </div>

      <Section title="Units">
        <Table
          head={["Unit", "Views", "People", "Actions", "Last seen"]}
          rows={units.map((u) => [
            <Link key={u.orgId} href={`/super-admin/orgs/${u.slug}`}>
              {u.displayName}
            </Link>,
            fmt(u.views),
            fmt(u.people),
            fmt(u.actions),
            ago(u.lastSeen),
          ])}
        />
      </Section>

      <Section title="Signed-in people">
        <Table
          head={["Person", "Products", "Views", "Actions", "Last seen"]}
          rows={people.map((p) => [
            <Link key={p.userId} href={`/super-admin/analytics/people/${p.userId}`}>
              {p.displayName} <span className="text-ink-muted">{p.email}</span>
            </Link>,
            p.products.map((x) => PRODUCT_NAME[x] ?? x).join(", "),
            fmt(p.views),
            fmt(p.actions),
            ago(p.lastSeen),
          ])}
        />
        <p className="text-xs text-ink-muted">Adults only. Scouts are counted above but never listed.</p>
      </Section>

      <Section title="Signed-out visits">
        <Table
          head={["Visitor", "Pages", "Came from", "Device", "When"]}
          rows={visits.map((v) => [
            <span key={v.hash} className="font-mono text-xs">
              {v.hash.slice(0, 6)}
            </span>,
            <span key="p" className="font-mono text-xs">
              {v.paths.join(" → ")}
              {v.views > v.paths.length ? ` (+${v.views - v.paths.length})` : ""}
            </span>,
            v.referrer || v.source || "direct",
            v.device ?? "—",
            ago(v.last),
          ])}
        />
        <p className="text-xs text-ink-muted">
          Each line is one browser on one day. The code changes every day and can&apos;t be traced to a person.
        </p>
      </Section>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  if (!rows.length) return <p className="text-sm text-ink-muted">Nothing yet.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
            {head.map((h, i) => (
              <th key={h} className={`px-3 py-2 font-medium ${i > 0 ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={`px-3 py-2 ${j > 0 ? "text-right" : ""}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Counts({ title, rows, empty = "Nothing yet." }: { title: string; rows: CountRow[]; empty?: string }) {
  const total = rows.reduce((a, r) => a + r.count, 0) || 1;
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <h3 className="mb-2 text-xs uppercase tracking-wide text-ink-muted">{title}</h3>
      {rows.length ? (
        <ul className="space-y-1 text-sm">
          {rows.map((r) => (
            <li key={r.label} className="flex justify-between gap-3">
              <span className="truncate">{r.label}</span>
              <span className="text-ink-muted">
                {fmt(r.count)} · {Math.round((r.count / total) * 100)}%
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-muted">{empty}</p>
      )}
    </div>
  );
}
