"use client";

// DataGrid wrapper for the treasury ledger table. The parent server
// component still does the server-side fund/type/member filtering
// + reversal-pair collapse; this client component adds the
// DataGrid affordances (header sort, global text filter, in-page
// CSV export) on top of the already-narrowed result set.

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { DataGrid } from "@/components/admin/DataGrid";
import { Pill } from "@/components/ui";
import { centsToDollars, TX_TYPE_LABELS, type TxType } from "@/lib/treasury/money";
import { ReverseButton } from "@/components/admin/TreasuryForms";
import type { ColumnDef } from "@tanstack/react-table";

export type LedgerRow = {
  id: string;
  postedAtIso: string;
  fundName: string;
  type: string;
  memberId: string | null;
  memberLabel: string | null;
  description: string;
  reversesId: string | null;
  amountCents: number;
};

export function LedgerGrid({
  orgSlug,
  rows,
  csrfNode,
}: {
  orgSlug: string;
  rows: LedgerRow[];
  csrfNode: ReactNode;
}) {
  const columns = useMemo<ColumnDef<LedgerRow, unknown>[]>(() => {
    return [
      {
        id: "posted",
        header: "Posted",
        accessorFn: (r) => r.postedAtIso,
        cell: (info) => (
          <span className="text-slate-soft whitespace-nowrap">
            {new Date(info.getValue() as string).toLocaleString()}
          </span>
        ),
        sortingFn: "alphanumeric",
      },
      {
        id: "fund",
        header: "Fund",
        accessorFn: (r) => r.fundName,
        cell: (info) => (
          <span className="text-slate-soft">{info.getValue() as string}</span>
        ),
      },
      {
        id: "type",
        header: "Type",
        accessorFn: (r) => r.type,
        cell: (info) => {
          const r = info.row.original;
          return (
            <Pill tone={r.amountCents >= 0 ? "success" : "danger"}>
              {TX_TYPE_LABELS[r.type as TxType] ?? r.type}
            </Pill>
          );
        },
      },
      {
        id: "member",
        header: "Member",
        accessorFn: (r) => r.memberLabel ?? "",
        cell: (info) => {
          const r = info.row.original;
          if (!r.memberId)
            return <span className="text-slate-muted">—</span>;
          return (
            <Link
              href={`/o/${orgSlug}/admin/treasury/members/${r.memberId}`}
              className="text-slate-soft hover:text-accent"
              onClick={(e) => e.stopPropagation()}
            >
              {r.memberLabel ?? r.memberId.slice(0, 8)}
            </Link>
          );
        },
      },
      {
        id: "description",
        header: "Description",
        accessorFn: (r) => r.description,
        cell: (info) => {
          const r = info.row.original;
          return (
            <span className="text-slate-soft">
              {r.description}
              {r.reversesId ? (
                <span className="ml-2 text-xs text-slate-muted">
                  (reverses {r.reversesId.slice(0, 8)})
                </span>
              ) : null}
            </span>
          );
        },
      },
      {
        id: "amount",
        header: "Amount",
        accessorFn: (r) => r.amountCents,
        cell: (info) => {
          const v = info.row.original.amountCents;
          return (
            <span
              className={
                "block text-right font-mono " +
                (v < 0 ? "text-danger" : "text-success")
              }
            >
              {centsToDollars(v)}
            </span>
          );
        },
        sortingFn: "alphanumeric",
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: (info) => {
          const r = info.row.original;
          if (r.reversesId) {
            return (
              <span className="text-xs text-slate-muted">reversal</span>
            );
          }
          return (
            <span onClick={(e) => e.stopPropagation()}>
              <ReverseButton
                orgSlug={orgSlug}
                txnId={r.id}
                csrf={csrfNode}
              />
            </span>
          );
        },
      },
    ];
  }, [orgSlug, csrfNode]);

  return (
    <DataGrid
      data={rows}
      columns={columns}
      searchPlaceholder="Filter rows by description, fund, member…"
      emptyMessage="No transactions match."
      csvName={`ledger-${orgSlug}`}
    />
  );
}
