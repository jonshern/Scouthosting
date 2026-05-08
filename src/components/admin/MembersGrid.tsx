"use client";

// DataGrid wrapper for the roster Scouts/Adults tabs. The parent
// server page does the encrypted-PII decrypt + isYouth/status
// filtering; this client component layers sort + global filter on
// top of the already-decrypted result set. The name cell renders a
// real <Link> (so middle-click and getByRole("link") both work) and
// the whole row is also clickable as a UX nicety.

import { useMemo } from "react";
import Link from "next/link";
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

// Server pages can't pass functions across the RSC boundary, so we
// take primitives and build the drawer URL inside the client.
// drawerBaseHref is the canonical /o/<slug>/admin/members URL;
// drawerBaseQuery is the existing roster querystring (tab, q, trash)
// without leading "?" or "&" — may be empty.
export function MembersGrid({
  rows,
  drawerBaseHref,
  drawerBaseQuery,
  emptyMessage,
}: {
  rows: MemberGridRow[];
  drawerBaseHref: string;
  drawerBaseQuery: string;
  emptyMessage?: string;
}) {
  const drawerHref = (memberId: string) => {
    const params = drawerBaseQuery
      ? `${drawerBaseQuery}&member=${encodeURIComponent(memberId)}`
      : `member=${encodeURIComponent(memberId)}`;
    return `${drawerBaseHref}?${params}`;
  };
  const columns = useMemo<ColumnDef<MemberGridRow, unknown>[]>(() => {
    return [
      {
        id: "name",
        header: "Name",
        accessorFn: (r) => `${r.lastName}, ${r.firstName}`,
        cell: (info) => {
          const r = info.row.original;
          return (
            <Link
              href={drawerHref(r.id)}
              scroll={false}
              className="font-semibold text-ink hover:text-accent"
              onClick={(e) => e.stopPropagation()}
            >
              {r.firstName} {r.lastName}
            </Link>
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
  }, [drawerHref]);

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
