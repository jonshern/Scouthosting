// /super-admin/people — every account and which products it uses:
// Compass (belongs to a unit), Waypoint (counselor badges or signed in
// to the Waypoint app or site), Lantern (has scouts on a trail, or
// signed in to the Lantern app or site). Lantern families with no troop
// show up here too.

import Link from "next/link";
import { listPeople, PRODUCT_LABEL, type Product } from "@/lib/owner/console";
import { Pill, shortDate } from "@/components/owner/ConsoleBits";

export const dynamic = "force-dynamic";

const FILTERS: { key: Product | "none"; label: string }[] = [
  { key: "compass", label: "Compass" },
  { key: "waypoint", label: "Waypoint" },
  { key: "lantern", label: "Lantern" },
  { key: "none", label: "No product yet" },
];

export default async function OwnerPeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const product = FILTERS.find((f) => f.key === sp.product)?.key ?? null;
  const people = await listPeople({ q: sp.q, product });
  const href = (p: string | null) => {
    const q = new URLSearchParams();
    if (p) q.set("product", p);
    if (sp.q) q.set("q", sp.q);
    const s = q.toString();
    return s ? `/super-admin/people?${s}` : "/super-admin/people";
  };

  return (
    <section className="space-y-5">
      <h2 className="font-display font-semibold text-2xl">People ({people.length})</h2>

      <form method="GET" className="flex flex-wrap items-end gap-2">
        {product ? <input type="hidden" name="product" value={product} /> : null}
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Name or email"
          aria-label="Search people"
          className="field min-w-[260px] flex-1"
        />
        <button type="submit" className="btn-secondary">
          Search
        </button>
      </form>

      <nav aria-label="Product filter" className="flex flex-wrap gap-3 text-sm">
        <Link href={href(null)} className={!product ? "font-semibold underline" : ""}>
          Everyone
        </Link>
        {FILTERS.map((f) => (
          <Link key={f.key} href={href(f.key)} className={product === f.key ? "font-semibold underline" : ""}>
            {f.label}
          </Link>
        ))}
      </nav>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="py-2 pr-3">Person</th>
              <th className="pr-3">Products</th>
              <th className="pr-3">Units</th>
              <th className="pr-3">Lantern scouts</th>
              <th>Signed up</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id} className="border-b border-line-soft align-top">
                <td className="py-2 pr-3">
                  <Link href={`/super-admin/people/${p.id}`} className="font-medium">
                    {p.displayName}
                  </Link>
                  <div className="text-xs text-ink-muted">{p.email}</div>
                  {p.disabledAt ? <Pill tone="bad">Turned off</Pill> : null}
                  {p.isSuperAdmin ? <Pill tone="info">Owner</Pill> : null}
                </td>
                <td className="pr-3">
                  <span className="flex flex-wrap gap-1">
                    {p.products.map((x) => (
                      <Pill key={x} tone="info">
                        {PRODUCT_LABEL[x]}
                      </Pill>
                    ))}
                  </span>
                </td>
                <td className="pr-3 text-xs">
                  {p.units.map((u) => (
                    <div key={u.slug}>
                      <Link href={`/super-admin/orgs/${u.slug}`}>{u.displayName}</Link>{" "}
                      <span className="text-ink-muted">({u.role})</span>
                    </div>
                  ))}
                </td>
                <td className="pr-3">{p.lanternScouts || ""}</td>
                <td className="text-xs text-ink-muted">{shortDate(p.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {people.length === 0 ? <p className="mt-4 text-sm text-ink-muted">No one matches.</p> : null}
      </div>
    </section>
  );
}
