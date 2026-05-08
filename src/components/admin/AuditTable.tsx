// Shared presentational audit table. Used by /admin/audit and
// /super-admin/audit. Filters live in the parent so they can drive
// either the per-org or cross-org variant.

import Link from "next/link";
import type { AuditRow } from "@/lib/audit-query";
import { Pill } from "@/components/ui";

const TONE: Record<string, "neutral" | "accent" | "success" | "danger" | "amber"> = {
  create: "success",
  update: "accent",
  delete: "danger",
  publish: "amber",
  revert: "amber",
};

export function AuditTable({
  rows,
  showOrg = false,
}: {
  rows: AuditRow[];
  showOrg?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-slate-muted">
        No audit entries match these filters.
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-surface-alt text-left text-[11px] uppercase tracking-[0.08em] text-slate-muted">
          <tr>
            <th className="px-4 py-2 font-semibold">When</th>
            {showOrg ? <th className="px-4 py-2 font-semibold">Org</th> : null}
            <th className="px-4 py-2 font-semibold">Actor</th>
            <th className="px-4 py-2 font-semibold">Entity</th>
            <th className="px-4 py-2 font-semibold">Action</th>
            <th className="px-4 py-2 font-semibold">Summary</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-3 align-top text-slate-soft whitespace-nowrap">
                {r.createdAt.toLocaleString()}
              </td>
              {showOrg ? (
                <td className="px-4 py-3 align-top">
                  {r.orgSlug ? (
                    <Link
                      href={`/super-admin/orgs/${r.orgSlug}`}
                      className="text-sky hover:text-ink"
                    >
                      {r.orgDisplayName ?? r.orgSlug}
                    </Link>
                  ) : (
                    <span className="text-slate-muted">—</span>
                  )}
                </td>
              ) : null}
              <td className="px-4 py-3 align-top text-slate-soft">
                {r.userDisplay ?? <span className="text-slate-muted">system</span>}
              </td>
              <td className="px-4 py-3 align-top text-slate-soft">
                <div>{r.entityType}</div>
                {r.entityId ? (
                  <div className="text-xs text-slate-muted">{r.entityId}</div>
                ) : null}
              </td>
              <td className="px-4 py-3 align-top">
                <Pill tone={TONE[r.action] ?? "neutral"}>{r.action}</Pill>
              </td>
              <td className="px-4 py-3 align-top text-slate-soft">{r.summary ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
