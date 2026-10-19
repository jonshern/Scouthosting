// /super-admin/orgs — every unit and its license, filterable by license
// state and searchable by name, slug, city or scoutmaster email.

import Link from "next/link";
import { listUnits } from "@/lib/owner/console";
import { LICENSE_KINDS, type LicenseKind } from "@/lib/owner/license";
import { LicensePill, shortDate } from "@/components/owner/ConsoleBits";

export const dynamic = "force-dynamic";

const KINDS = new Set<string>(LICENSE_KINDS.map((k) => k.kind));

export default async function OwnerUnitsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const kind = sp.kind && KINDS.has(sp.kind) ? (sp.kind as LicenseKind) : null;
  const units = await listUnits({ kind, q: sp.q });
  const href = (k: string | null) => {
    const q = new URLSearchParams();
    if (k) q.set("kind", k);
    if (sp.q) q.set("q", sp.q);
    const s = q.toString();
    return s ? `/super-admin/orgs?${s}` : "/super-admin/orgs";
  };

  return (
    <section className="space-y-5">
      <h2 className="text-[28px] font-semibold leading-tight tracking-[-0.03em]">Units ({units.length})</h2>

      <form method="GET" className="flex flex-wrap items-end gap-2">
        {kind ? <input type="hidden" name="kind" value={kind} /> : null}
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Name, slug, city or scoutmaster email"
          aria-label="Search units"
          className="field min-w-[260px] flex-1"
        />
        <button type="submit" className="btn-secondary">
          Search
        </button>
      </form>

      <nav aria-label="License filter" className="flex flex-wrap gap-2 text-sm">
        <Link href={href(null)} className={!kind ? "rounded-full bg-ink px-3 py-1 font-medium text-white no-underline hover:text-white" : "rounded-full border border-line bg-surface px-3 py-1 text-ink-2 no-underline hover:border-control hover:text-ink"}>
          All
        </Link>
        {LICENSE_KINDS.map((k) => (
          <Link key={k.kind} href={href(k.kind)} className={kind === k.kind ? "rounded-full bg-ink px-3 py-1 font-medium text-white no-underline hover:text-white" : "rounded-full border border-line bg-surface px-3 py-1 text-ink-2 no-underline hover:border-control hover:text-ink"}>
            {k.label}
          </Link>
        ))}
      </nav>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
            <tr>
              <th className="py-2 pr-3">Unit</th>
              <th className="pr-3">License</th>
              <th className="pr-3">Details</th>
              <th className="pr-3 text-right">Adults</th>
              <th className="pr-3 text-right">Scouts</th>
              <th className="pr-3">Owner</th>
              <th>Signed up</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <tr key={u.id} className="border-b border-line-soft align-top">
                <td className="py-2 pr-3">
                  <Link href={`/super-admin/orgs/${u.slug}`} className="font-medium">
                    {u.displayName}
                  </Link>
                  <div className="font-mono text-xs text-ink-muted">{u.slug}</div>
                </td>
                <td className="pr-3">
                  <LicensePill license={u.license} />
                </td>
                <td className="pr-3 text-xs text-ink-muted">{u.license.detail}</td>
                <td className="pr-3 text-right">{u.adults}</td>
                <td className="pr-3 text-right">{u.scouts}</td>
                <td className="pr-3 text-xs">
                  {u.owner ? <Link href={`/super-admin/people/${u.owner.id}`}>{u.owner.email}</Link> : "—"}
                </td>
                <td className="text-xs text-ink-muted">{shortDate(u.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {units.length === 0 ? <p className="mt-4 text-sm text-ink-muted">No units match.</p> : null}
      </div>
    </section>
  );
}
