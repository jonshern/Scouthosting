// /super-admin/errors — errors from Compass's pages and API and crashes
// the apps reported, grouped by where they happen. Filter by time,
// service or unit; groups marked fixed hide until they recur.

import Link from "next/link";
import { prisma } from "@/lib/db";
import { errorGroups, errorServices } from "@/lib/owner/errors";
import { Pill, shortDate } from "@/components/owner/ConsoleBits";
import { requireOwnerPage } from "@/lib/owner/guard";

export const dynamic = "force-dynamic";

const WINDOWS = [1, 7, 30] as const;

function ago(d: Date, now = Date.now()): string {
  const mins = Math.round((now - d.getTime()) / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return shortDate(d);
}

export default async function OwnerErrorsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; days?: string; service?: string; fixed?: string }>;
}) {
  await requireOwnerPage();
  const sp = await searchParams;
  const days = WINDOWS.find((w) => String(w) === sp.days) ?? 7;
  const org = sp.org
    ? await prisma.org.findUnique({ where: { slug: sp.org }, select: { id: true, slug: true, displayName: true } })
    : null;
  const showFixed = sp.fixed === "1";
  const [groups, services] = await Promise.all([
    errorGroups({ days, service: sp.service || null, orgId: org?.id ?? null, showFixed }),
    errorServices(),
  ]);
  const href = (over: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const merged = { org: sp.org ?? null, days: String(days), service: sp.service ?? null, fixed: showFixed ? "1" : null, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    return `/super-admin/errors?${q.toString()}`;
  };

  return (
    <section className="space-y-5">
      <h2 className="text-[28px] font-semibold leading-tight tracking-[-0.03em]">
        Errors{org ? ` in ${org.displayName}` : ""} ({groups.length})
      </h2>

      <nav aria-label="Error filters" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {WINDOWS.map((w) => (
          <Link key={w} href={href({ days: String(w) })} className={days === w ? "rounded-full bg-ink px-3 py-1 font-medium text-white no-underline hover:text-white" : "rounded-full border border-line bg-surface px-3 py-1 text-ink-2 no-underline hover:border-control hover:text-ink"}>
            {w === 1 ? "Last day" : `Last ${w} days`}
          </Link>
        ))}
        <span className="text-ink-muted">·</span>
        <Link href={href({ service: null })} className={!sp.service ? "rounded-full bg-ink px-3 py-1 font-medium text-white no-underline hover:text-white" : "rounded-full border border-line bg-surface px-3 py-1 text-ink-2 no-underline hover:border-control hover:text-ink"}>
          Everywhere
        </Link>
        {services.map((s) => (
          <Link key={s} href={href({ service: s })} className={sp.service === s ? "rounded-full bg-ink px-3 py-1 font-medium text-white no-underline hover:text-white" : "rounded-full border border-line bg-surface px-3 py-1 text-ink-2 no-underline hover:border-control hover:text-ink"}>
            {s}
          </Link>
        ))}
        <span className="text-ink-muted">·</span>
        <Link href={href({ fixed: showFixed ? null : "1" })}>{showFixed ? "Hide fixed" : "Show fixed"}</Link>
        {org ? <Link href={href({ org: null })}>All units</Link> : null}
      </nav>

      {groups.length === 0 ? (
        <p className="text-ink-muted">No errors in this window.</p>
      ) : (
        <ul className="divide-y divide-divider rounded-xl border border-line bg-surface">
          {groups.map((g) => (
            <li key={g.fingerprint} className="px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/super-admin/errors/${g.fingerprint}`} className="font-medium">
                  {g.name}: {g.message.slice(0, 140)}
                </Link>
                <Pill tone="muted">{g.service}</Pill>
                {g.fixed ? <Pill tone="good">fixed</Pill> : g.fixedAt ? <Pill tone="bad">back after fix</Pill> : null}
              </div>
              <div className="mt-0.5 text-xs text-ink-muted">
                {g.count} times · {g.units} units · {g.people} people · last {ago(g.lastSeen)} · first {shortDate(g.firstSeen)}
                {g.path ? <span className="font-mono"> · {g.path.slice(0, 80)}</span> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
