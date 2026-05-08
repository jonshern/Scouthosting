"use client";

// Shared audit table. Used by /admin/audit and /super-admin/audit.
// Server-side filtering + pagination still live on the parent
// pages; this component layers DataGrid affordances (header sort,
// global text filter, CSV export) on the already-narrowed page.

import { useMemo } from "react";
import Link from "next/link";
import { DataGrid } from "@/components/admin/DataGrid";
import { Pill } from "@/components/ui";
import type { AuditRow } from "@/lib/audit-query";
import type { ColumnDef } from "@tanstack/react-table";

const TONE: Record<string, "neutral" | "accent" | "success" | "danger" | "amber"> = {
  create: "success",
  update: "accent",
  delete: "danger",
  publish: "amber",
  revert: "amber",
};

// Server pages still hand us a Date for createdAt — we keep the
// existing prop shape so existing callers don't need to change.
export function AuditTable({
  rows,
  showOrg = false,
}: {
  rows: AuditRow[];
  showOrg?: boolean;
}) {
  const columns = useMemo<ColumnDef<AuditRow, unknown>[]>(() => {
    const cols: ColumnDef<AuditRow, unknown>[] = [
      {
        id: "when",
        header: "When",
        accessorFn: (r) =>
          r.createdAt instanceof Date
            ? r.createdAt.toISOString()
            : String(r.createdAt),
        cell: (info) => {
          const v = info.getValue() as string;
          return (
            <span className="text-slate-soft whitespace-nowrap">
              {new Date(v).toLocaleString()}
            </span>
          );
        },
        sortingFn: "alphanumeric",
      },
    ];
    if (showOrg) {
      cols.push({
        id: "org",
        header: "Org",
        accessorFn: (r) => r.orgDisplayName ?? r.orgSlug ?? "",
        cell: (info) => {
          const r = info.row.original;
          if (!r.orgSlug)
            return <span className="text-slate-muted">—</span>;
          return (
            <Link
              href={`/super-admin/orgs/${r.orgSlug}`}
              className="text-sky hover:text-ink"
              onClick={(e) => e.stopPropagation()}
            >
              {r.orgDisplayName ?? r.orgSlug}
            </Link>
          );
        },
      });
    }
    cols.push(
      {
        id: "actor",
        header: "Actor",
        accessorFn: (r) => r.userDisplay ?? "",
        cell: (info) => {
          const r = info.row.original;
          return r.userDisplay ? (
            <span className="text-slate-soft">{r.userDisplay}</span>
          ) : (
            <span className="text-slate-muted">system</span>
          );
        },
      },
      {
        id: "entity",
        header: "Entity",
        accessorFn: (r) =>
          `${r.entityType}${r.entityId ? ` ${r.entityId}` : ""}`,
        cell: (info) => {
          const r = info.row.original;
          return (
            <div className="text-slate-soft">
              <div>{r.entityType}</div>
              {r.entityId ? (
                <div className="text-xs text-slate-muted">{r.entityId}</div>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "action",
        header: "Action",
        accessorFn: (r) => r.action,
        cell: (info) => {
          const r = info.row.original;
          return <Pill tone={TONE[r.action] ?? "neutral"}>{r.action}</Pill>;
        },
      },
      {
        id: "summary",
        header: "Summary",
        accessorFn: (r) => r.summary ?? "",
        cell: (info) => (
          <span className="text-slate-soft">
            {(info.getValue() as string) || ""}
          </span>
        ),
      },
    );
    return cols;
  }, [showOrg]);

  return (
    <DataGrid
      data={rows}
      columns={columns}
      searchPlaceholder="Filter rows by actor, entity, summary…"
      emptyMessage="No audit entries match these filters."
      csvName="audit-log"
    />
  );
}
