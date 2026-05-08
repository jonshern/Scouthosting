"use client";

// DataGrid wrapper for the roster Scouts/Adults tabs. The parent
// server page does the encrypted-PII decrypt + isYouth/status
// filtering; this client component layers sort + global filter on
// top of the already-decrypted result set. Row click pushes the
// member-drawer URL.

import { useMemo } from "react";
import { DataGrid } from "@/components/admin/DataGrid";
import { Pill } from "@/components/ui";
import type { ColumnDef } from "@tanstack/react-table";

export type MemberGridRow = {
  id: string;
  firstName: string;
  lastName: string;
  patrol: string | null;
  position: string | null;
  email: string | null;
  isYouth: boolean;
  status: string;
};

export function MembersGrid({
  rows,
  drawerHref,
  emptyMessage,
}: {
  rows: MemberGridRow[];
  drawerHref: (memberId: string) => string;
  emptyMessage?: string;
}) {
  const columns = useMemo<ColumnDef<MemberGridRow, unknown>[]>(() => {
    return [
      {
        id: "name",
        header: "Name",
        accessorFn: (r) => `${r.lastName}, ${r.firstName}`,
        cell: (info) => {
          const r = info.row.original;
          return (
            <span className="font-semibold text-ink">
              {r.firstName} {r.lastName}
            </span>
          );
        },
      },
      {
        id: "type",
        header: "Type",
        accessorFn: (r) => (r.isYouth ? "Youth" : "Adult"),
        cell: (info) => (
          <span className="text-slate-soft text-xs">
            {info.getValue() as string}
          </span>
        ),
      },
      {
        id: "patrol",
        header: "Patrol",
        accessorFn: (r) => r.patrol ?? "",
        cell: (info) => {
          const v = info.getValue() as string;
          return v ? (
            <span className="text-slate-soft">{v}</span>
          ) : (
            <span className="text-slate-muted">—</span>
          );
        },
      },
      {
        id: "position",
        header: "Position",
        accessorFn: (r) => r.position ?? "",
        cell: (info) => {
          const v = info.getValue() as string;
          return v ? (
            <span className="text-slate-soft">{v}</span>
          ) : (
            <span className="text-slate-muted">—</span>
          );
        },
      },
      {
        id: "email",
        header: "Email",
        accessorFn: (r) => r.email ?? "",
        cell: (info) => {
          const v = info.getValue() as string;
          return v ? (
            <span className="text-slate-soft text-xs">{v}</span>
          ) : (
            <span className="text-slate-muted">—</span>
          );
        },
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (r) => r.status,
        cell: (info) => {
          const r = info.row.original;
          if (r.status === "active")
            return <Pill tone="success">Active</Pill>;
          if (r.status === "prospect")
            return <Pill tone="amber">Prospect</Pill>;
          return <span className="text-slate-muted text-xs">{r.status}</span>;
        },
      },
    ];
  }, []);

  return (
    <DataGrid
      data={rows}
      columns={columns}
      searchPlaceholder="Filter visible rows by name, patrol, email…"
      emptyMessage={emptyMessage ?? "No members."}
      onRowHref={(r) => drawerHref(r.id)}
    />
  );
}
