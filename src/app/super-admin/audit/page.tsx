// Cross-org audit viewer for operators. Same shape as the per-org
// version but adds an Org column and lets the operator filter by org
// slug. Layout-level guard already enforces isSuperAdmin.

import Link from "next/link";
import { AuditTable } from "@/components/admin/AuditTable";
import { listAuditLogs, entityTypeOptions } from "@/lib/audit-query";
import { prisma } from "@/lib/db";

type Search = {
  org?: string;
  entity?: string;
  action?: string;
  q?: string;
  before?: string;
};

export default async function SuperAdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const orgFilter = sp.org
    ? await prisma.org.findUnique({ where: { slug: sp.org } })
    : null;

  const before = sp.before ? new Date(sp.before) : null;
  const orgs = await prisma.org.findMany({
    select: { slug: true, displayName: true },
    orderBy: { displayName: "asc" },
  });

  const { rows, hasMore, nextBefore } = await listAuditLogs({
    orgId: orgFilter ? orgFilter.id : undefined,
    entityType: sp.entity ?? null,
    action: sp.action ?? null,
    q: sp.q ?? null,
    before,
  });
  const entityTypes = await entityTypeOptions(orgFilter?.id ?? null);

  const baseQuery = new URLSearchParams();
  if (sp.org) baseQuery.set("org", sp.org);
  if (sp.entity) baseQuery.set("entity", sp.entity);
  if (sp.action) baseQuery.set("action", sp.action);
  if (sp.q) baseQuery.set("q", sp.q);

  const nextHref =
    hasMore && nextBefore
      ? (() => {
          const q = new URLSearchParams(baseQuery);
          q.set("before", nextBefore.toISOString());
          return `?${q.toString()}`;
        })()
      : null;

  return (
    <section className="space-y-8">
      <header>
        <h2 className="font-display font-semibold text-2xl">Audit log</h2>
        <p className="text-sm text-slate-muted">
          Cross-org activity stream. Filter by org to scope a single
          tenant.
        </p>
      </header>

      <form action="" method="GET" className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="org">Org</label>
          <select id="org" name="org" defaultValue={sp.org ?? ""} className="field">
            <option value="">All orgs</option>
            {orgs.map((o) => (
              <option key={o.slug} value={o.slug}>
                {o.displayName} ({o.slug})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="entity">Entity</label>
          <select id="entity" name="entity" defaultValue={sp.entity ?? ""} className="field">
            <option value="">All</option>
            {entityTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="action">Action</label>
          <select id="action" name="action" defaultValue={sp.action ?? ""} className="field">
            <option value="">All</option>
            <option value="create">create</option>
            <option value="update">update</option>
            <option value="delete">delete</option>
            <option value="publish">publish</option>
            <option value="revert">revert</option>
          </select>
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="label" htmlFor="q">Search</label>
          <input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Summary, entityId, actor" className="field" />
        </div>
        <button type="submit" className="btn-secondary">Apply</button>
      </form>

      <AuditTable rows={rows} showOrg />

      <div className="flex items-center justify-between text-sm text-slate-muted">
        <span>{rows.length} entries</span>
        {nextHref ? (
          <Link href={nextHref} className="text-sky hover:text-ink">
            Older entries →
          </Link>
        ) : null}
      </div>
    </section>
  );
}
