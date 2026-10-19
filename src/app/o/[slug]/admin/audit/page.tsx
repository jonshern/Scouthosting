// Per-org audit viewer. Filter by entity type, action, and free-text
// search. Pagination is "load more before this timestamp" — clicking
// the link appends ?before=ISO to the URL.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AuditTable } from "@/components/admin/AuditTable";
import { listAuditLogs, entityTypeOptions } from "@/lib/audit-query";
import { requireAdminPage } from "@/lib/admin/guard";

export const metadata = { title: "Activity log" };

type Search = { entity?: string; action?: string; q?: string; before?: string };

export default async function OrgAuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Search>;
}) {
  const { slug } = await params;
  await requireAdminPage(slug);
  const sp = await searchParams;
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();

  const before = sp.before ? new Date(sp.before) : null;
  const [{ rows, hasMore, nextBefore }, entityTypes] = await Promise.all([
    listAuditLogs({
      orgId: org.id,
      entityType: sp.entity ?? null,
      action: sp.action ?? null,
      q: sp.q ?? null,
      before,
    }),
    entityTypeOptions(org.id),
  ]);

  const baseQuery = new URLSearchParams();
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
      <AdminPageHeader
        kicker="Audit"
        title="Activity log"
        description="Every create / update / delete written through the admin surface, in reverse chronological order."
      />

      <form action="" method="GET" className="flex flex-wrap items-end gap-3">
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
          <input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Summary, entityId, actor name" className="field" />
        </div>
        <button type="submit" className="btn-secondary">Apply</button>
      </form>

      <AuditTable rows={rows} />

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
