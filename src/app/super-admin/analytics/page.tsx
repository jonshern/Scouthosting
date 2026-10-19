// /__super/analytics — operator analytics rollups.

import {
  marketingFunnel,
  pageViewsByDay,
  recentErrors,
  recentFetchFails,
  summarize,
  topClicks,
  topOrgs,
  topPaths,
} from "@/lib/tracking/analytics";
import { requireOwnerPage } from "@/lib/owner/guard";

export default async function SuperAnalyticsPage() {
  await requireOwnerPage();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [summary, paths, clicks, fetches, errors, byDay, orgs, funnel] = await Promise.all([
    summarize({ since }),
    topPaths({ since, limit: 10 }),
    topClicks({ since, limit: 10 }),
    recentFetchFails({ since, limit: 10 }),
    recentErrors({ since, limit: 10 }),
    pageViewsByDay({ since }),
    topOrgs({ since, limit: 10 }),
    marketingFunnel({ since }),
  ]);

  return (
    <section className="space-y-6">
      <h2 className="font-display text-xl">Last 7 days</h2>

      <div className="grid grid-cols-3 gap-4">
        <Stat label="Events" value={summary.totals.events} />
        <Stat label="Page views" value={summary.totals.pageViews} />
        <Stat label="Clicks" value={summary.totals.clicks} />
        <Stat label="Signups" value={summary.totals.signups} />
        <Stat label="Errors" value={summary.totals.errors} />
        <Stat label="Fetch fails" value={summary.totals.fetchFails} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card title="Top paths">
          {paths.map((p) => (
            <li key={p.path} className="flex justify-between text-sm">
              <span className="font-mono text-xs">{p.path}</span>
              <span className="text-ink-muted">{p.count}</span>
            </li>
          ))}
        </Card>
        <Card title="Top click labels">
          {clicks.map((c) => (
            <li key={c.label} className="flex justify-between text-sm">
              <span>{c.label}</span>
              <span className="text-ink-muted">{c.count}</span>
            </li>
          ))}
        </Card>
        <Card title="Page views by day">
          {byDay.map((d) => (
            <li key={d.day} className="flex justify-between text-sm">
              <span className="font-mono text-xs">{d.day}</span>
              <span className="text-ink-muted">{d.count}</span>
            </li>
          ))}
        </Card>
        <Card title="Top orgs">
          {orgs.map((o) => (
            <li key={o.orgId ?? "unknown"} className="flex justify-between text-sm">
              <span>{o.org?.displayName ?? "(unknown)"}</span>
              <span className="text-ink-muted">{o.count}</span>
            </li>
          ))}
        </Card>
        <Card title="Recent client errors">
          {errors.map((e) => (
            <li key={e.id} className="text-xs">
              <span className="font-mono">{e.path}</span> · {e.message.slice(0, 80)}
            </li>
          ))}
        </Card>
        <Card title="Recent fetch fails">
          {fetches.map((f) => (
            <li key={f.id} className="text-xs">
              {f.status} · <span className="font-mono">{f.url}</span>
            </li>
          ))}
        </Card>
      </div>

      <section>
        <h3 className="font-display text-lg mb-2">Marketing funnel</h3>
        <ul className="space-y-1">
          {funnel.stages.map((s) => (
            <li key={s.key} className="flex justify-between text-sm">
              <span>{s.label}</span>
              <span>
                {s.count}
                {s.conversion != null
                  ? ` · ${(s.conversion * 100).toFixed(1)}%`
                  : ""}
              </span>
            </li>
          ))}
        </ul>
        {funnel.overall != null && (
          <p className="mt-2 text-sm text-ink-muted">
            Overall views → signups: {(funnel.overall * 100).toFixed(2)}%
          </p>
        )}
      </section>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card text-center">
      <div className="text-2xl font-display">{value}</div>
      <div className="text-xs text-ink-muted uppercase tracking-wide">{label}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h3 className="font-medium mb-2">{title}</h3>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}
